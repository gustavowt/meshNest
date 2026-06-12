// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { arrayValue } from '@duckdb/node-api'
import { DuckDbClient } from '@/services/database/duckdbClient'
import { runMigrations, MIGRATIONS } from '@/services/database/migrations'
import { EMBEDDING_DIMENSIONS } from '@/services/database/schema'

const EXPECTED_TABLES = [
  'model_files',
  'geometry_metadata',
  'three_mf_metadata',
  'model_render_assets',
  'ai_model_descriptions',
  'model_embeddings',
  'indexing_jobs',
  'settings',
  'schema_migrations',
]

const openClients: DuckDbClient[] = []

async function openClient(path = ':memory:') {
  const client = await DuckDbClient.open(path)
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

    expect(first).toEqual(MIGRATIONS.map((m) => m.id))
    expect(second).toEqual([])
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
})
