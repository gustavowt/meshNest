// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { arrayValue } from '@duckdb/node-api'
import { DuckDbClient } from '@/services/database/duckdbClient'
import {
  DUCKDB_MIGRATIONS,
  SQLITE_MIGRATIONS,
  ensureVecTable,
  runMigrations,
} from '@/services/database/migrations'
import {
  CREATE_MODEL_FILES,
  EMBEDDING_DIMENSIONS,
  getVecTableName,
} from '@/services/database/schema'
import { SqliteClient, type SqliteOpenOptions } from '@/services/database/sqliteClient'

const EXPECTED_TABLES = [
  'model_files',
  'geometry_metadata',
  'three_mf_metadata',
  'model_render_assets',
  'ai_model_descriptions',
  'model_embeddings',
  'indexing_jobs',
  'schema_migrations',
]

const openClients: DuckDbClient[] = []

async function openClient(path = ':memory:', options?: { enableVss?: boolean }) {
  const client = await DuckDbClient.open(path, options)
  openClients.push(client)
  return client
}

afterEach(async () => {
  while (openClients.length > 0) {
    await openClients.pop()!.close()
  }
})

describe('database migrations', () => {
  test('creates all tables on a fresh database', async () => {
    const client = await openClient()
    await runMigrations(client)

    const rows = await client.all<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'",
    )
    const tables = rows.map((row) => row.table_name)
    for (const table of EXPECTED_TABLES) {
      expect(tables).toContain(table)
    }
  })

  test('runs safely more than once', async () => {
    const client = await openClient()
    const first = await runMigrations(client)
    const second = await runMigrations(client)

    expect(first).toEqual(DUCKDB_MIGRATIONS.map((m) => m.id))
    expect(second).toEqual([])
  })

  test('model file absolute path index is non-unique', async () => {
    const client = await openClient()
    await runMigrations(client)

    const sharedPath = '/models/shared.stl'
    for (const id of ['file-1', 'file-2']) {
      await client.run(
        `INSERT INTO model_files (
           id, project_id, absolute_path, relative_path, filename, extension,
           size_bytes, modified_at, content_hash, status
         ) VALUES (
           $id, 'project-1', $absolutePath, 'shared.stl', 'shared.stl', 'stl',
           1, '2026-06-01 12:00:00'::TIMESTAMP, $contentHash, 'pending'
         )`,
        { id, absolutePath: sharedPath, contentHash: `hash-${id}` },
      )
    }

    const rows = await client.all<{ count: number }>(
      'SELECT count(*) AS count FROM model_files WHERE absolute_path = $absolutePath',
      { absolutePath: sharedPath },
    )
    expect(Number(rows[0].count)).toBe(2)
  })

  test('migrates an existing unique model file path index to non-unique', async () => {
    const client = await openClient()
    await client.run(CREATE_MODEL_FILES)
    await client.run(
      'CREATE UNIQUE INDEX idx_model_files_absolute_path ON model_files (absolute_path);',
    )
    await client.run(`
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT now()
      );
    `)
    await client.run("INSERT INTO schema_migrations (id) VALUES ('001_initial_schema')")
    await client.run("INSERT INTO schema_migrations (id) VALUES ('002_embeddings_hnsw_index')")

    expect(await runMigrations(client)).toEqual(['003_model_files_absolute_path_non_unique'])

    for (const id of ['file-1', 'file-2']) {
      await client.run(
        `INSERT INTO model_files (
           id, project_id, absolute_path, relative_path, filename, extension,
           size_bytes, modified_at, content_hash, status
         ) VALUES (
           $id, 'project-1', '/models/shared.stl', 'shared.stl', 'shared.stl', 'stl',
           1, '2026-06-01 12:00:00'::TIMESTAMP, $contentHash, 'pending'
         )`,
        { id, contentHash: `hash-${id}` },
      )
    }

    const rows = await client.all<{ count: number }>('SELECT count(*) AS count FROM model_files')
    expect(Number(rows[0].count)).toBe(2)
  })

  test('embedding table accepts vectors of the configured dimension', async () => {
    const client = await openClient()
    await runMigrations(client)

    const embedding = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i / EMBEDDING_DIMENSIONS)
    await client.run(
      `INSERT INTO model_embeddings (model_file_id, provider, model, dimensions, embedding, source_text)
       VALUES ($id, $provider, $model, $dimensions, $embedding, $sourceText)`,
      {
        id: 'file-1',
        provider: 'mock',
        model: 'mock-embedding',
        dimensions: EMBEDDING_DIMENSIONS,
        embedding: arrayValue(embedding),
        sourceText: 'test',
      },
    )

    const rows = await client.all<{ count: number }>('SELECT count(*) AS count FROM model_embeddings')
    expect(Number(rows[0].count)).toBe(1)
  })

  test('HNSW index exists and vector search works on a persisted database', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'meshnest-db-'))
    try {
      const client = await openClient(join(dir, 'test.duckdb'))
      await runMigrations(client)

      const indexes = await client.all<{ index_name: string }>(
        'SELECT index_name FROM duckdb_indexes()',
      )
      expect(indexes.map((row) => row.index_name)).toContain('idx_model_embeddings_hnsw')

      const embedding = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.5)
      await client.run(
        `INSERT INTO model_embeddings (model_file_id, provider, model, dimensions, embedding, source_text)
         VALUES ('f1', 'mock', 'mock', $dims, $emb, 'text')`,
        { dims: EMBEDDING_DIMENSIONS, emb: arrayValue(embedding) },
      )
      const results = await client.all<{ distance: number }>(
        `SELECT array_cosine_distance(embedding, $query::FLOAT[${EMBEDDING_DIMENSIONS}]) AS distance
         FROM model_embeddings ORDER BY distance LIMIT 1`,
        { query: arrayValue(embedding) },
      )
      expect(results).toHaveLength(1)
      expect(Number(results[0].distance)).toBeCloseTo(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('without VSS: migrations complete, 002 recorded, cosine search works, no HNSW', async () => {
    const client = await openClient(':memory:', { enableVss: false })
    expect(client.vssAvailable).toBe(false)

    const applied = await runMigrations(client)
    expect(applied).toEqual(DUCKDB_MIGRATIONS.map((m) => m.id))

    const migrationRows = await client.all<{ id: string }>(
      'SELECT id FROM schema_migrations ORDER BY id',
    )
    expect(migrationRows.map((row) => row.id)).toContain('002_embeddings_hnsw_index')

    // Idempotent: second run must not re-apply or fail on missing HNSW.
    expect(await runMigrations(client)).toEqual([])

    const indexes = await client.all<{ index_name: string }>(
      'SELECT index_name FROM duckdb_indexes()',
    )
    expect(indexes.map((row) => row.index_name)).not.toContain('idx_model_embeddings_hnsw')

    const embedding = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.5)
    await client.run(
      `INSERT INTO model_embeddings (model_file_id, provider, model, dimensions, embedding, source_text)
       VALUES ('f1', 'mock', 'mock', $dims, $emb, 'text')`,
      { dims: EMBEDDING_DIMENSIONS, emb: arrayValue(embedding) },
    )
    const results = await client.all<{ distance: number }>(
      `SELECT array_cosine_distance(embedding, $query::FLOAT[${EMBEDDING_DIMENSIONS}]) AS distance
       FROM model_embeddings ORDER BY distance LIMIT 1`,
      { query: arrayValue(embedding) },
    )
    expect(results).toHaveLength(1)
    expect(Number(results[0].distance)).toBeCloseTo(0)
  })
})

describe('sqlite database migrations', () => {
  const openSqliteClients: SqliteClient[] = []

  async function openSqliteClient(path = ':memory:', options?: SqliteOpenOptions) {
    const client = await SqliteClient.open(path, options)
    openSqliteClients.push(client)
    return client
  }

  afterEach(async () => {
    while (openSqliteClients.length > 0) {
      await openSqliteClients.pop()!.close()
    }
  })

  test('creates all tables on a fresh sqlite database', async () => {
    const client = await openSqliteClient()
    const applied = await runMigrations(client)
    expect(applied).toEqual(SQLITE_MIGRATIONS.map((m) => m.id))

    const rows = await client.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    )
    const tables = rows.map((row) => row.name)
    for (const table of EXPECTED_TABLES) {
      expect(tables).toContain(table)
    }
  })

  test('runs safely more than once (idempotent)', async () => {
    const client = await openSqliteClient()
    const first = await runMigrations(client)
    const second = await runMigrations(client)

    expect(first).toEqual(SQLITE_MIGRATIONS.map((m) => m.id))
    expect(second).toEqual([])
  })

  test('without vec extension: migrations complete, 002 recorded', async () => {
    const client = await openSqliteClient(':memory:', { enableVec: false })
    expect(client.vecAvailable).toBe(false)

    const applied = await runMigrations(client)
    expect(applied).toEqual(SQLITE_MIGRATIONS.map((m) => m.id))

    const migrationRows = await client.all<{ id: string }>(
      'SELECT id FROM schema_migrations ORDER BY id',
    )
    expect(migrationRows.map((row) => row.id)).toContain('sqlite_002_vec_extension')

    // Idempotent: second run must not re-apply.
    expect(await runMigrations(client)).toEqual([])
  })

  test('ensureVecTable creates virtual vec0 table and supports cosine distance search', async () => {
    const client = await openSqliteClient()
    const tableName = await ensureVecTable(client, 4)
    expect(tableName).toBe(getVecTableName(4))

    // Idempotent: safe to call more than once
    const secondTableName = await ensureVecTable(client, 4)
    expect(secondTableName).toBe(tableName)

    const v1 = new Float32Array([1.0, 0.0, 0.0, 0.0])
    const v2 = new Float32Array([0.0, 1.0, 0.0, 0.0])
    await client.run(
      `INSERT INTO ${tableName} (model_file_id, embedding) VALUES (?, ?)`,
      ['file-1', v1],
    )
    await client.run(
      `INSERT INTO ${tableName} (model_file_id, embedding) VALUES (?, ?)`,
      ['file-2', v2],
    )

    const results = await client.all<{ model_file_id: string; distance: number }>(
      `SELECT model_file_id, distance FROM ${tableName} WHERE embedding MATCH ? AND k = 1`,
      [v1],
    )
    expect(results).toHaveLength(1)
    expect(results[0].model_file_id).toBe('file-1')
    expect(Number(results[0].distance)).toBeCloseTo(0)
  })

  test('ensureVecTable validates inputs and throws if vec is unavailable', async () => {
    const client = await openSqliteClient()
    await expect(ensureVecTable(client, 0)).rejects.toThrow('Dimensions must be a positive integer')
    await expect(ensureVecTable(client, -4)).rejects.toThrow('Dimensions must be a positive integer')
    await expect(ensureVecTable(client, 3.14)).rejects.toThrow('Dimensions must be a positive integer')

    const noVecClient = await openSqliteClient(':memory:', { enableVec: false })
    await expect(ensureVecTable(noVecClient, 4)).rejects.toThrow(
      'Cannot ensure vec table: sqlite-vec extension is not available',
    )
  })
})
