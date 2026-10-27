/**
 * Spike: verify better-sqlite3 + sqlite-vec load cleanly under plain node.
 *
 * PLAN.md step 1 evidence gathering: dynamically imports both modules inside a
 * try/catch (so an ABI/module failure becomes printed evidence, not a crash),
 * opens a temp-file database, loads the sqlite-vec extension, creates a small
 * vec0 table (8 dims), inserts 10 vectors and runs one top-5 KNN query.
 *
 * Prints exactly one JSON evidence line to stdout:
 *   { context: 'node', node: '<version>', ok: true|false,
 *     steps: { open, load, createTable, insert, knn }, error: null|'<message>' }
 * Exit code: 0 on success, 1 on failure.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * @typedef {Object} SpikeSteps
 * @property {boolean} open
 * @property {boolean} load
 * @property {boolean} createTable
 * @property {boolean} insert
 * @property {boolean} knn
 */

/**
 * @param {boolean} ok
 * @param {SpikeSteps} steps
 * @param {string|null} error
 */
function printEvidence(ok, steps, error) {
  const evidence = {
    context: 'node',
    node: process.versions.node,
    ok,
    steps,
    error,
  }
  console.log(JSON.stringify(evidence))
}

/** @returns {Promise<number>} */
async function main() {
  /** @type {SpikeSteps} */
  const steps = { open: false, load: false, createTable: false, insert: false, knn: false }
  let tempDir = null
  try {
    // Dynamic imports inside try/catch: load/ABI failures surface as evidence.
    const { default: Database } = await import('better-sqlite3')
    const sqliteVec = await import('sqlite-vec')

    tempDir = mkdtempSync(path.join(os.tmpdir(), 'spike-sqlite-vec-'))
    const db = new Database(path.join(tempDir, 'spike.db'))
    steps.open = true

    sqliteVec.load(db)
    steps.load = true

    db.exec('CREATE VIRTUAL TABLE spike_vec USING vec0(embedding float[8])')
    steps.createTable = true

    const insert = db.prepare('INSERT INTO spike_vec (embedding) VALUES (?)')
    // Insert 10 deterministic little-endian float32 vectors: row 1 stays all
    // zeros, rows 2..10 set dimension (i % 8) to (i + 1), so the KNN result is
    // stable and verifiable.
    const vectors = []
    for (let i = 0; i < 10; i++) {
      const vec = new Float32Array(8)
      if (i > 0) {
        vec[i % 8] = i + 1
      }
      vectors.push(vec)
    }
    const insertAll = db.transaction(() => {
      for (const vec of vectors) {
        insert.run(Buffer.from(vec.buffer, 0, vec.byteLength))
      }
    })
    insertAll()
    steps.insert = true

    const knn = db.prepare(
      'SELECT rowid, distance FROM spike_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 5',
    )
    // Query vector: unit vector in dimension 1 -> rowid 2 (value 2) should win.
    const queryVec = new Float32Array(8)
    queryVec[1] = 1
    const knnRows = knn.all(Buffer.from(queryVec.buffer, 0, queryVec.byteLength))
    if (!Array.isArray(knnRows) || knnRows.length === 0 || knnRows.length > 5) {
      throw new Error(`unexpected KNN result size: ${knnRows ? knnRows.length : 'none'}`)
    }
    steps.knn = true

    printEvidence(true, steps, null)
    return 0
  } catch (err) {
    printEvidence(false, steps, String(err))
    return 1
  } finally {
    if (tempDir !== null) {
      try {
        rmSync(tempDir, { recursive: true, force: true })
      } catch {
        // Best-effort cleanup; never masks the evidence line.
      }
    }
  }
}

main().then((code) => {
  process.exit(code)
})