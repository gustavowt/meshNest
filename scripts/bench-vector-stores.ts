/**
 * Vector store benchmark for the meshNest semantic search migration (PLAN.md step 1).
 *
 * Compares three local vector stores on identical deterministic data:
 *   - 'duckdb':     @duckdb/node-api brute-force cosine (mirrors the app's MAS-real path
 *     from src/services/database/duckdbClient.ts + searchRepository.ts: NO
 *     INSTALL/LOAD of the vss extension, file-backed db, per-row inserts)
 *   - 'sqlite-vec': better-sqlite3 + sqlite-vec vec0 virtual table
 *   - 'lancedb':    @lancedb/lancedb (pinned to 0.22.3, see notes below)
 *
 * Run (plain node, no tsx):
 *   node --experimental-strip-types scripts/bench-vector-stores.ts [--quick]
 *        [--rows 1000,10000] [--dims 384,768,1536] [--out results.json] [--help]
 *
 * Decision gate (written before running, per PLAN.md step 1):
 *   p95 of top-20 query latency for sqlite-vec at 100000 rows x 1536 dims < 200 ms
 *   => sqlite-vec is the GO; MISS => fall back to LanceDB.
 *
 * Methodology notes:
 *   - Dataset: deterministic mulberry32 PRNG (fixed seed), rows normalized to
 *     unit length, generated ONCE per (rows, dims) config and reused across all
 *     three stores; the first 100 rows double as the query set. The dataset is
 *     freed before the next config (8 GB machine, keep peak memory low).
 *   - DuckDB inserts mirror the app's real per-row path (embeddingRepository.ts
 *     upsert): one connection.run per row with arrayValue(vec) + explicit
 *     ARRAY(FLOAT, dims) type, wrapped in BEGIN TRANSACTION/COMMIT. Since
 *     ModelEmbedding.embedding is number[] and arrayValue(Float32Array) fails to
 *     bind, each row view is copied via Array.from() inside the timed loop —
 *     exactly the shape the app pays for per row.
 *   - DuckDB VSS extension is deliberately NOT loaded: that is the MAS-real
 *     brute-force mode (duckdbClient.ts skips INSTALL/LOAD on Mac App Store builds).
 *   - sqlite-vec: vec0 float32 BLOB binding (little-endian float32 bytes; safe on
 *     all supported darwin/linux platforms, all little-endian). KNN uses the
 *     sqlite-vec v0.1.9 README form: SELECT rowid, distance FROM v
 *     WHERE embedding MATCH ? ORDER BY distance LIMIT ?. sqlite-vec 0.1.9
 *     documents no distance-metric option — its `distance` column is L2, but for
 *     unit-normalized vectors L2 ranking is identical to cosine ranking, so the
 *     top-20 is comparable.
 *   - LanceDB: pinned to 0.22.3 because every stable release after it (0.23.0+)
 *     ships no darwin-x64 native binding (platform packages exist only for
 *     darwin-arm64; no universal package) — 0.40.0 cannot even load on this
 *     machine. Bulk add uses chunked records with number[] vector values, the
 *     supported path in 0.22.3 that infers FixedSizeList<float32> for the column
 *     named 'vector'; conversion happens OUTSIDE the timed region (treated like
 *     dataset generation cost). Queries: table.query().nearestTo(vec)
 *     .distanceType('cosine').limit(20) — cosine is MANDATORY for comparability.
 *     LanceDB insert timing includes creation of the table with its first chunk
 *     (createTable requires data in 0.22.3), so Lance insert numbers are slightly
 *     conservative vs the DDL-excluded DuckDB/sqlite numbers.
 *   - Timing: performance.now(); per (config, store): 5 warmup queries discarded,
 *     then 100 timed top-20 queries. Percentiles use nearest-rank on the sorted
 *     samples (no interpolation): sorted[ceil(p / 100 * n) - 1], clamped.
 *   - Row counts are verified with a cheap count query OUTSIDE the timed region;
 *     a mismatch is recorded as a failure (no query timing for that store).
 *   - Every (config, store) is wrapped in try/catch: failures are recorded and
 *     remaining configs still run. Temp files/dirs live under a per-config
 *     mkdtemp() dir in os.tmpdir() and are removed in a finally block.
 *   - Exit code 0 only if every requested config succeeded.
 */

import { DuckDBInstance, ARRAY, arrayValue, FLOAT } from '@duckdb/node-api'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

type StoreName = 'duckdb' | 'sqlite-vec' | 'lancedb'

/** Full experimental grid from PLAN.md step 1. */
const DEFAULT_ROWS = [1000, 10000, 50000, 100000]
const DEFAULT_DIMS = [384, 768, 1536]
const STORES: StoreName[] = ['duckdb', 'sqlite-vec', 'lancedb']

/** Fixed PRNG seed so every run of this benchmark uses identical vectors. */
const DATA_SEED = 314159

/** Rows that double as the query set (kept small and deterministic). */
const QUERY_SET_SIZE = 100
/** Warmup queries discarded per (config, store) before timing starts. */
const WARMUP_QUERIES = 5
/** Timed top-20 queries per (config, store). */
const N_QUERIES = 100
const TOP_K = 20
/** Chunk size for LanceDB bulk adds (bounds transient number[][] memory). */
const LANCE_CHUNK_ROWS = 5000

type Dataset = {
  /** rows * dims float32 values; row i lives at [i * dims, (i + 1) * dims). */
  data: Float32Array
  dims: number
  rows: number
  /** Zero-copy view of row i. */
  view(row: number): Float32Array
}

type StoreTiming = {
  insertMs: number
  insertRowsPerSec: number
  p50Ms: number
  p95Ms: number
  rowCount: number
}

type ConfigResult =
  | ({ ok: true } & { rows: number; dims: number; store: StoreName } & StoreTiming)
  | { ok: false; rows: number; dims: number; store: StoreName; error: string }

type BenchPayload = {
  schema: 1
  ranAt: string
  node: string
  platform: { os: string; arch: string; cpus: number; totalMemGB: number }
  configs: ConfigResult[]
}

type CliOptions = {
  rows?: number[]
  dims?: number[]
  quick: boolean
  out?: string
  help: boolean
}

/**
 * Deterministic 32-bit PRNG (mulberry32). Small, well-known implementation;
 * the identical seed always yields the identical sequence.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Builds the shared dataset for one (rows, dims) config: seeded random values,
 * each row scaled to unit length. Zero-length rows (probability ~0) get a
 * deterministic 1 in their first dimension instead of a NaN scale factor.
 */
function generateDataset(rows: number, dims: number): Dataset {
  const data = new Float32Array(rows * dims)
  const rng = mulberry32(DATA_SEED)
  for (let row = 0; row < rows; row++) {
    const offset = row * dims
    let sumSquares = 0
    for (let d = 0; d < dims; d++) {
      const value = rng() * 2 - 1
      data[offset + d] = value
      sumSquares += value * value
    }
    if (sumSquares === 0) {
      data[offset] = 1
      continue
    }
    const scale = 1 / Math.sqrt(sumSquares)
    for (let d = 0; d < dims; d++) {
      data[offset + d] *= scale
    }
  }
  return {
    data,
    dims,
    rows,
    view(row: number): Float32Array {
      return data.subarray(row * dims, (row + 1) * dims)
    },
  }
}

/**
 * Nearest-rank percentile on pre-sorted ascending samples, no interpolation:
 * sorted[ceil(p / 100 * n) - 1], clamped into [0, n - 1].
 */
function percentile(sortedSamples: number[], p: number): number {
  const n = sortedSamples.length
  const index = Math.ceil((p / 100) * n) - 1
  const clamped = Math.max(0, Math.min(n - 1, index))
  return sortedSamples[clamped]
}

/**
 * Runs `runOnce` WARMUP_QUERIES times (discarded), then times N_QUERIES calls.
 * Accepts sync or async runOnce so all three stores can share the loop.
 */
async function collectQuerySamples(runOnce: () => void | Promise<void>): Promise<number[]> {
  for (let i = 0; i < WARMUP_QUERIES; i++) {
    await runOnce()
  }
  const samples: number[] = []
  for (let i = 0; i < N_QUERIES; i++) {
    const start = performance.now()
    await runOnce()
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  return samples
}

function buildTiming(
  rows: number,
  insertMs: number,
  rowCount: number,
  querySamples: number[],
): StoreTiming {
  return {
    insertMs,
    insertRowsPerSec: Math.round(rows / (insertMs / 1000)),
    p50Ms: percentile(querySamples, 50),
    p95Ms: percentile(querySamples, 95),
    rowCount,
  }
}

/**
 * Store A — DuckDB brute force, exactly the app's MAS-real mode
 * (no VSS extension, per-row inserts in a transaction, cosine search).
 */
async function runDuckDb(dataset: Dataset, storeDir: string): Promise<StoreTiming> {
  const { rows, dims, view } = dataset
  const instance = await DuckDBInstance.create(path.join(storeDir, 'bench.duckdb'))
  const connection = await instance.connect()
  try {
    await connection.run(`CREATE TABLE model_embeddings (embedding FLOAT[${dims}])`)
    const insertSql = 'INSERT INTO model_embeddings VALUES ($embedding)'
    const insertTypes = { embedding: ARRAY(FLOAT, dims) }

    const insertStart = performance.now()
    await connection.run('BEGIN TRANSACTION')
    for (let i = 0; i < rows; i++) {
      // number[] copy mirrors the app's real binding path (see header notes).
      // Throughput here intentionally reflects the app's per-row insert path.
      await connection.run(
        insertSql,
        { embedding: arrayValue(Array.from(view(i))) },
        insertTypes,
      )
    }
    await connection.run('COMMIT')
    const insertMs = performance.now() - insertStart

    const countReader = await connection.runAndReadAll(
      'SELECT count(*) AS c FROM model_embeddings',
    )
    const rowCount = Number(countReader.getRowObjectsJson()[0]?.c ?? 0)
    if (rowCount !== rows) {
      throw new Error(`row count mismatch: expected ${rows}, got ${rowCount}`)
    }

    const querySql =
      'SELECT array_cosine_distance(embedding, $queryEmbedding) AS distance ' +
      'FROM model_embeddings ORDER BY distance ASC LIMIT $limit'
    const queryTypes = { queryEmbedding: ARRAY(FLOAT, dims) }

    let queryIndex = 0
    const samples = await collectQuerySamples(async () => {
      // Query set = first min(rows, 100) rows, cycled deterministically. The
      // clamp keeps tiny ad-hoc grids (--rows 10) from reading past the buffer.
      const q = view(queryIndex++ % Math.min(rows, QUERY_SET_SIZE))
      const reader = await connection.runAndReadAll(
        querySql,
        { queryEmbedding: arrayValue(Array.from(q)), limit: TOP_K },
        queryTypes,
      )
      // Materialize results: read the distance column only.
      return reader.getRowObjectsJson().map((row) => Number(row.distance))
    })

    return buildTiming(rows, insertMs, rowCount, samples)
  } finally {
    connection.closeSync()
    instance.closeSync()
  }
}

/**
 * Store B — better-sqlite3 + sqlite-vec with a vec0 virtual table.
 * BLOB binding of little-endian float32, README-form KNN query.
 */
async function runSqliteVec(dataset: Dataset, storeDir: string): Promise<StoreTiming> {
  const { rows, dims, view } = dataset
  const { default: Database } = await import('better-sqlite3')
  const sqliteVec = await import('sqlite-vec')
  const db = new Database(path.join(storeDir, 'bench.db'))
  try {
    sqliteVec.load(db)
    db.exec(`CREATE VIRTUAL TABLE model_embeddings_vec USING vec0(embedding float[${dims}])`)

    const insertStmt = db.prepare('INSERT INTO model_embeddings_vec (embedding) VALUES (?)')
    /**
     * vec0 accepts either a JSON string or a compact binary format
     * (little-endian float32 bytes) per the sqlite-vec docs. Little-endian is
     * safe on darwin-arm64/x86-64 and linux x64/arm64, so we bind a Buffer
     * view straight over the row's Float32Array (offset-aware: rows are
     * subarray views into one big ArrayBuffer).
     */
    const toBlob = (rowView: Float32Array): Buffer =>
      Buffer.from(rowView.buffer, rowView.byteOffset, rowView.byteLength)

    const insertAll = db.transaction(() => {
      for (let i = 0; i < rows; i++) {
        insertStmt.run(toBlob(view(i)))
      }
    })
    const insertStart = performance.now()
    insertAll()
    const insertMs = performance.now() - insertStart

    const countRow = db
      .prepare('SELECT count(*) AS c FROM model_embeddings_vec')
      .get() as { c: number } | undefined
    const rowCount = Number(countRow?.c ?? 0)
    if (rowCount !== rows) {
      throw new Error(`row count mismatch: expected ${rows}, got ${rowCount}`)
    }

    // KNN in the documented form (sqlite-vec v0.1.9 README, "Sample usage").
    const knnStmt = db.prepare(
      'SELECT rowid, distance FROM model_embeddings_vec ' +
        'WHERE embedding MATCH ? ORDER BY distance LIMIT ?',
    )
    let queryIndex = 0
    const samples = await collectQuerySamples(() => {
      // Query set = first min(rows, 100) rows, cycled deterministically.
      const q = queryIndex++ % Math.min(rows, QUERY_SET_SIZE)
      const knnRows = knnStmt.all(toBlob(view(q)), TOP_K) as Array<{ distance: number }>
      return knnRows.map((row) => Number(row.distance))
    })

    return buildTiming(rows, insertMs, rowCount, samples)
  } finally {
    db.close()
  }
}

/**
 * Store C — LanceDB. Chunked number[]-record bulk add (the supported
 * FixedSizeList<float32> path in 0.22.3), cosine KNN, results via _distance.
 */
async function runLanceDb(dataset: Dataset, storeDir: string): Promise<StoreTiming> {
  const { rows, view } = dataset
  const lancedb = await import('@lancedb/lancedb')
  const db = await lancedb.connect(storeDir)

  let insertMs = 0
  let table: Awaited<ReturnType<typeof db.createTable>> | null = null
  for (let start = 0; start < rows; start += LANCE_CHUNK_ROWS) {
    const end = Math.min(start + LANCE_CHUNK_ROWS, rows)
    // Conversion to number[] records happens OUTSIDE the timed region
    // (treated like dataset generation; see header notes).
    const chunk: Array<{ vector: number[] }> = []
    for (let i = start; i < end; i++) {
      chunk.push({ vector: Array.from(view(i)) })
    }
    if (table === null) {
      // First chunk creates the table (createTable requires data in 0.22.3).
      const createStart = performance.now()
      table = await db.createTable('model_embeddings', chunk)
      insertMs += performance.now() - createStart
    } else {
      const addStart = performance.now()
      await table.add(chunk)
      insertMs += performance.now() - addStart
    }
  }

  const rowCount = Number(await table.countRows())
  if (rowCount !== rows) {
    throw new Error(`row count mismatch: expected ${rows}, got ${rowCount}`)
  }

  let queryIndex = 0
  const samples = await collectQuerySamples(async () => {
    // Query set = first min(rows, 100) rows, cycled deterministically.
    const q = view(queryIndex++ % Math.min(rows, QUERY_SET_SIZE))
    // Cosine is mandatory for comparability with the other two stores;
    // results are materialized via toArray() and reduced to the distance column.
    const knnRows = await table
      .query()
      .nearestTo(q)
      .distanceType('cosine')
      .limit(TOP_K)
      .toArray()
    return knnRows.map((row) => Number(row._distance))
  })

  return buildTiming(rows, insertMs, rowCount, samples)
}

const STORE_RUNNERS: Record<
  StoreName,
  (dataset: Dataset, storeDir: string) => Promise<StoreTiming>
> = {
  duckdb: runDuckDb,
  'sqlite-vec': runSqliteVec,
  lancedb: runLanceDb,
}

const STORE_DIRS: Record<StoreName, string> = {
  duckdb: 'duckdb',
  'sqlite-vec': 'sqlite',
  lancedb: 'lance',
}

function usage(): string {
  return [
    'Vector store benchmark: DuckDB brute force vs sqlite-vec vs LanceDB.',
    '',
    'Usage:',
    '  node --experimental-strip-types scripts/bench-vector-stores.ts [options]',
    '',
    'Options:',
    '  --rows <list>    comma-separated row counts (default: 1000,10000,50000,100000)',
    '  --dims <list>    comma-separated vector dimensions (default: 384,768,1536)',
    '  --quick          only run rows 1000 and 10000 (full dims grid)',
    '  --out <path>     write machine-readable JSON results to <path>',
    '  --help           show this help and exit',
    '',
    'Decision gate: sqlite-vec p95 top-20 @ 100k rows x 1536 dims < 200 ms => GO,',
    'otherwise fall back to LanceDB.',
  ].join('\n')
}

function parseNumberList(raw: string, label: string): number[] {
  const parsed = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number(part))
  if (parsed.length === 0) {
    throw new Error(`${label}: at least one value is required`)
  }
  for (const value of parsed) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${label}: values must be positive integers, got "${raw}"`)
    }
  }
  return Array.from(new Set(parsed))
}

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = { quick: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = argv[i + 1]
    switch (flag) {
      case '--help':
      case '-h':
        options.help = true
        break
      case '--quick':
        options.quick = true
        break
      case '--rows':
        if (next === undefined) throw new Error('--rows requires a value')
        options.rows = parseNumberList(next, '--rows')
        i++
        break
      case '--dims':
        if (next === undefined) throw new Error('--dims requires a value')
        options.dims = parseNumberList(next, '--dims')
        i++
        break
      case '--out':
        if (next === undefined || next.startsWith('--')) {
          throw new Error('--out requires a file path')
        }
        options.out = next
        i++
        break
      default:
        throw new Error(`unknown option: ${flag}`)
    }
  }
  return options
}

function formatTable(results: ConfigResult[]): string {
  const lines: string[] = [
    '   rows   dims store           insert rows/s  insert ms    p50 ms    p95 ms',
  ]
  for (const result of results) {
    if (!result.ok) {
      lines.push(
        String(result.rows).padStart(7) +
          ' ' +
          String(result.dims).padStart(6) +
          ' ' +
          result.store.padEnd(15) +
          ' FAILED (see failures above)',
      )
      continue
    }
    lines.push(
      String(result.rows).padStart(7) +
        ' ' +
        String(result.dims).padStart(6) +
        ' ' +
        result.store.padEnd(15) +
        ' ' +
        String(result.insertRowsPerSec).padStart(14) +
        ' ' +
        result.insertMs.toFixed(2).padStart(10) +
        ' ' +
        result.p50Ms.toFixed(2).padStart(9) +
        ' ' +
        result.p95Ms.toFixed(2).padStart(9),
    )
  }
  return lines.join('\n')
}

function printProgress(
  index: number,
  total: number,
  rows: number,
  dims: number,
  store: StoreName,
  result: ConfigResult,
): void {
  const label = `[${index}/${total}] rows=${rows} dims=${dims} store=${store}`
  if (result.ok) {
    console.log(
      `${label} ok insert=${result.insertMs.toFixed(2)}ms ` +
        `(${result.insertRowsPerSec} rows/s) ` +
        `p50=${result.p50Ms.toFixed(2)}ms p95=${result.p95Ms.toFixed(2)}ms`,
    )
  } else {
    console.log(`${label} FAILED: ${result.error}`)
  }
}

async function main(): Promise<number> {
  let options: CliOptions
  try {
    options = parseCli(process.argv.slice(2))
  } catch (err) {
    console.error(`Error: ${String(err)}`)
    console.error(usage())
    return 1
  }
  if (options.help) {
    console.log(usage())
    return 0
  }

  const rowsList = options.quick ? [1000, 10000] : (options.rows ?? DEFAULT_ROWS)
  const dimsList = options.dims ?? DEFAULT_DIMS
  const totalConfigs = rowsList.length * dimsList.length * STORES.length

  console.log(
    `vector-store benchmark: ${rowsList.length} rows configs x ${dimsList.length} dims ` +
      `x ${STORES.length} stores = ${totalConfigs} (config, store) runs`,
  )
  console.log(
    `node=${process.versions.node} os=${os.platform()} arch=${os.arch()} ` +
      `cpus=${os.cpus().length} totalMemGB=${(os.totalmem() / 2 ** 30).toFixed(1)}`,
  )

  const results: ConfigResult[] = []
  let runIndex = 0

  // Loop config-major: one dataset per (rows, dims), shared by all three stores,
  // freed before moving to the next config.
  for (const rows of rowsList) {
    for (const dims of dimsList) {
      let dataset: Dataset | null = generateDataset(rows, dims)
      let configDir: string | null = null
      try {
        configDir = mkdtempSync(path.join(os.tmpdir(), 'bench-vector-'))
        for (const store of STORES) {
          const storeDir = path.join(configDir, STORE_DIRS[store])
          mkdirSync(storeDir)
          let result: ConfigResult
          try {
            const timing = await STORE_RUNNERS[store](dataset as Dataset, storeDir)
            result = { ok: true, rows, dims, store, ...timing }
          } catch (err) {
            result = { ok: false, rows, dims, store, error: String(err) }
          }
          results.push(result)
          printProgress(++runIndex, totalConfigs, rows, dims, store, result)
        }
      } finally {
        if (configDir !== null) {
          rmSync(configDir, { recursive: true, force: true })
        }
        // Free the dataset before the next config; the runner loop is done with it.
        dataset = null
      }
    }
  }

  const failures = results.filter((result) => !result.ok)
  console.log('')
  console.log(formatTable(results))
  if (failures.length > 0) {
    console.log(`\n${failures.length} of ${results.length} runs failed:`)
    for (const failure of failures) {
      console.error(
        `  rows=${failure.rows} dims=${failure.dims} store=${failure.store}: ${failure.error}`,
      )
    }
  }

  if (options.out !== undefined) {
    const payload: BenchPayload = {
      schema: 1,
      ranAt: new Date().toISOString(),
      node: process.versions.node,
      platform: {
        os: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemGB: Number((os.totalmem() / 2 ** 30).toFixed(1)),
      },
      configs: results,
    }
    try {
      writeFileSync(options.out, `${JSON.stringify(payload, null, 2)}\n`)
      console.log(`\nresults written to ${options.out}`)
    } catch (err) {
      console.error(`failed to write results to ${options.out}: ${String(err)}`)
      return 1
    }
  }

  return failures.length === 0 ? 0 : 1
}

process.exit(await main())