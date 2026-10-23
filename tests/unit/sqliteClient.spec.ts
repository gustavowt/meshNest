// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { SqliteClient, type SqliteOpenOptions } from '@/services/database/sqliteClient'

const openClients: SqliteClient[] = []

async function openClient(path = ':memory:', options?: SqliteOpenOptions) {
  const client = await SqliteClient.open(path, options)
  openClients.push(client)
  return client
}

afterEach(async () => {
  while (openClients.length > 0) {
    await openClients.pop()!.close()
  }
})

describe('SqliteClient', () => {
  test('SqliteClient.open(":memory:") loads sqlite-vec by default and reports vecAvailable === true', async () => {
    const client = await openClient(':memory:')
    expect(client.vecAvailable).toBe(true)
  })

  test('SELECT vec_version() AS version executes successfully and returns a version string when vecAvailable === true', async () => {
    const client = await openClient(':memory:')
    expect(client.vecAvailable).toBe(true)
    const rows = await client.all<{ version: string }>('SELECT vec_version() AS version')
    expect(rows).toHaveLength(1)
    expect(typeof rows[0].version).toBe('string')
    expect(rows[0].version.length).toBeGreaterThan(0)
  })

  test('enableVec: false skips sqlite-vec extension loading and reports vecAvailable === false', async () => {
    const client = await openClient(':memory:', { enableVec: false })
    expect(client.vecAvailable).toBe(false)
    await expect(client.all('SELECT vec_version() AS version')).rejects.toThrow()
  })

  test('sets busy_timeout pragma (default 5000 and custom options.timeout)', async () => {
    const defaultClient = await openClient(':memory:')
    const defaultRows = await defaultClient.all<{ timeout: number }>('PRAGMA busy_timeout')
    expect(defaultRows[0].timeout).toBe(5000)

    const customClient = await openClient(':memory:', { timeout: 10000 })
    const customRows = await customClient.all<{ timeout: number }>('PRAGMA busy_timeout')
    expect(customRows[0].timeout).toBe(10000)
  })

  test('sets journal_mode = WAL on a persisted disk database', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'meshnest-sqlite-wal-'))
    let client: SqliteClient | undefined
    try {
      const dbPath = join(dir, 'test.sqlite')
      client = await SqliteClient.open(dbPath)
      const rows = await client.all<{ journal_mode: string }>('PRAGMA journal_mode')
      expect(rows[0].journal_mode.toLowerCase()).toBe('wal')
    } finally {
      if (client) {
        await client.close()
      }
      rmSync(dir, { recursive: true, force: true })
    }
  })

  describe('run and all parameter handling', () => {
    test('handles empty params (exec multi-statement)', async () => {
      const client = await openClient()
      await client.run(`
        CREATE TABLE items (id TEXT PRIMARY KEY, value INTEGER);
        INSERT INTO items (id, value) VALUES ('a', 1);
        INSERT INTO items (id, value) VALUES ('b', 2);
      `)

      const rowsNoParam = await client.all<{ id: string; value: number }>('SELECT * FROM items ORDER BY id')
      expect(rowsNoParam).toEqual([
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
      ])

      const rowsEmptyArray = await client.all<{ id: string; value: number }>(
        'SELECT * FROM items ORDER BY id',
        [],
      )
      expect(rowsEmptyArray).toEqual([
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
      ])

      const rowsEmptyObj = await client.all<{ id: string; value: number }>(
        'SELECT * FROM items ORDER BY id',
        {},
      )
      expect(rowsEmptyObj).toEqual([
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
      ])
    })

    test('handles positional params array (?)', async () => {
      const client = await openClient()
      await client.run('CREATE TABLE items (id TEXT PRIMARY KEY, value INTEGER);')
      await client.run('INSERT INTO items (id, value) VALUES (?, ?)', ['x', 42])

      const rows = await client.all<{ id: string; value: number }>(
        'SELECT * FROM items WHERE id = ? AND value = ?',
        ['x', 42],
      )
      expect(rows).toEqual([{ id: 'x', value: 42 }])
    })

    test('handles named params object (:key or bare keys)', async () => {
      const client = await openClient()
      await client.run('CREATE TABLE items (id TEXT PRIMARY KEY, value INTEGER);')

      // Named params with :key in SQL and bare keys in parameter object
      await client.run('INSERT INTO items (id, value) VALUES (:id, :value)', {
        id: 'bare-key',
        value: 100,
      })

      const rowsBare = await client.all<{ id: string; value: number }>(
        'SELECT * FROM items WHERE id = :id',
        { id: 'bare-key' },
      )
      expect(rowsBare).toEqual([{ id: 'bare-key', value: 100 }])
    })
  })

  test('rawDb getter exposes the underlying better-sqlite3 database instance', async () => {
    const client = await openClient()
    expect(client.rawDb.open).toBe(true)

    await client.run('CREATE TABLE items (id TEXT PRIMARY KEY, value INTEGER);')

    const insertTx = client.rawDb.transaction((rows: Array<{ id: string; value: number }>) => {
      for (const row of rows) {
        client.rawDb.prepare('INSERT INTO items (id, value) VALUES (?, ?)').run(row.id, row.value)
      }
    })

    insertTx([
      { id: 'tx-1', value: 10 },
      { id: 'tx-2', value: 20 },
    ])

    const count = client.rawDb.prepare('SELECT count(*) AS count FROM items').pluck().get()
    expect(count).toBe(2)
  })

  test('close() cleanly closes the connection', async () => {
    const client = await SqliteClient.open(':memory:')
    expect(client.rawDb.open).toBe(true)
    await client.close()
    expect(client.rawDb.open).toBe(false)
    await expect(client.close()).resolves.toBeUndefined()
  })
})
