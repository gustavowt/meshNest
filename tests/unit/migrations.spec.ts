// @vitest-environment node
import { afterEach, describe, expect, test } from 'vitest'
import {
  SQLITE_MIGRATIONS,
  ensureVecTable,
  runMigrations,
} from '@/services/database/migrations'
import { getVecTableName } from '@/services/database/schema'
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

describe('database migrations', () => {
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
