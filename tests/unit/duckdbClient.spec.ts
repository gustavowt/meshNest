// @vitest-environment node
import { afterEach, describe, expect, test } from 'vitest'
import { DuckDbClient } from '@/services/database/duckdbClient'

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

describe('DuckDbClient.open', () => {
  test('loads VSS by default and reports vssAvailable', async () => {
    const client = await openClient()
    expect(client.vssAvailable).toBe(true)
    // HNSW index type is only available after VSS load.
    await client.run(`
      CREATE TABLE t (id TEXT PRIMARY KEY, embedding FLOAT[2]);
      CREATE INDEX idx_t_hnsw ON t USING HNSW (embedding) WITH (metric = 'cosine');
    `)
  })

  test('enableVss: false skips VSS and still opens', async () => {
    const client = await openClient(':memory:', { enableVss: false })
    expect(client.vssAvailable).toBe(false)
    await client.run('CREATE TABLE t (id TEXT PRIMARY KEY)')
    const rows = await client.all<{ count: number }>('SELECT count(*) AS count FROM t')
    expect(Number(rows[0].count)).toBe(0)
  })

  test('enableVss: false cannot create an HNSW index', async () => {
    const client = await openClient(':memory:', { enableVss: false })
    await client.run('CREATE TABLE t (id TEXT PRIMARY KEY, embedding FLOAT[2])')
    await expect(
      client.run(`
        CREATE INDEX idx_t_hnsw ON t USING HNSW (embedding) WITH (metric = 'cosine');
      `),
    ).rejects.toThrow()
  })

  test('process.mas defaults enableVss to false without options', async () => {
    const proc = process as NodeJS.Process & { mas?: boolean }
    const previousMas = proc.mas
    proc.mas = true
    try {
      // Production MAS path: open(path) with no options (see database.ts).
      const client = await openClient()
      expect(client.vssAvailable).toBe(false)
      await client.run('CREATE TABLE t (id TEXT PRIMARY KEY, embedding FLOAT[2])')
      await expect(
        client.run(`
          CREATE INDEX idx_t_hnsw ON t USING HNSW (embedding) WITH (metric = 'cosine');
        `),
      ).rejects.toThrow()
    } finally {
      if (previousMas === undefined) {
        delete proc.mas
      } else {
        proc.mas = previousMas
      }
    }
  })
})
