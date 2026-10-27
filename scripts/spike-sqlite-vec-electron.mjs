/**
 * Spike: verify better-sqlite3 + sqlite-vec load cleanly in the Electron MAIN
 * process (the context where meshNest would actually use them).
 *
 * Must be run by the electron binary, e.g.:
 *   npx electron scripts/spike-sqlite-vec-electron.mjs
 *
 * Like its node counterpart, it dynamically imports better-sqlite3 AND
 * sqlite-vec inside a try/catch, so a native-module ABI mismatch with the
 * Electron runtime becomes printed evidence instead of a crash. It never opens
 * a window or touches BrowserWindow; it works headless (on macOS electron can
 * run from a terminal with no display).
 *
 * Prints exactly one JSON evidence line to stdout:
 *   { context: 'electron-main',
 *     versions: { electron, node, modules }, ok: true|false,
 *     steps: { open, load, createTable, insert, knn }, error: null|'<message>' }
 * Then exits with 0 on success / 1 on failure via app.exit().
 */

import { app } from 'electron'
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
 * @param {{electron: unknown, node: unknown, modules: unknown}} versionInfo
 * @param {boolean} ok
 * @param {SpikeSteps} steps
 * @param {string|null} error
 */
function printEvidence(versionInfo, ok, steps, error) {
  const evidence = {
    context: 'electron-main',
    versions: versionInfo,
    ok,
    steps,
    error,
  }
  console.log(JSON.stringify(evidence))
}

/**
 * @returns {Promise<{ok: boolean, steps: SpikeSteps, error: string|null}>}
 */
async function runSpike() {
  /** @type {SpikeSteps} */
  const steps = { open: false, load: false, createTable: false, insert: false, knn: false }
  let tempDir = null
  try {
    // Dynamic imports inside try/catch: Electron ABI mismatches surface as
    // evidence, not a crashed main process.
    const { default: Database } = await import('better-sqlite3')
    const sqliteVec = await import('sqlite-vec')

    tempDir = mkdtempSync(path.join(os.tmpdir(), 'spike-sqlite-vec-electron-'))
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

    return { ok: true, steps, error: null }
  } catch (err) {
    return { ok: false, steps, error: String(err) }
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

app.whenReady().then(async () => {
  const result = await runSpike()
  printEvidence(
    {
      electron: process.versions.electron,
      node: process.versions.node,
      modules: process.versions.modules,
    },
    result.ok,
    result.steps,
    result.error,
  )
  // Give stdout a moment to flush before the abrupt app.exit().
  setTimeout(() => {
    app.exit(result.ok ? 0 : 1)
  }, 100)
})