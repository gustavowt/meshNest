// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { EmbeddingRepository } from '@/services/database/embeddingRepository'
import {
  clearEmbeddings,
  ensureEmbeddingTable,
  getEmbeddingTableDimensions,
} from '@/services/database/embeddingTable'
import { ensureVecTable, runMigrations } from '@/services/database/migrations'
import { ModelFileRepository } from '@/services/database/modelFileRepository'
import { SqliteClient } from '@/services/database/sqliteClient'
import type { ScannedFile } from '@/types/modelFile'

let client: SqliteClient

function scannedFile(name: string): ScannedFile {
  return {
    absolutePath: `/models/${name}`,
    relativePath: name,
    filename: name,
    extension: 'stl',
    sizeBytes: 10,
    modifiedAt: new Date('2026-01-01').toISOString(),
    contentHash: `hash-${name}`,
  }
}

function vector(dimensions: number, seed: number): number[] {
  const values = Array.from({ length: dimensions }, (_, i) => Math.sin(seed * 31 + i))
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0))
  return values.map((v) => v / norm)
}

describe('embedding table (sqlite-vec)', () => {
  beforeEach(async () => {
    client = await SqliteClient.open(':memory:')
    await runMigrations(client)
  })

  afterEach(async () => {
    await client.close()
  })

  test('ensureVecTable / ensureEmbeddingTable creates per-dimension vec0 table and is idempotent', async () => {
    const tableName = await ensureVecTable(client, 1536)
    expect(tableName).toBe('vec_model_embeddings_1536')

    // Calling it again is idempotent
    const secondCall = await ensureVecTable(client, 1536)
    expect(secondCall).toBe('vec_model_embeddings_1536')

    // ensureEmbeddingTable also ensures the vec table and returns rebuilt: false
    const result = await ensureEmbeddingTable(client, 1536)
    expect(result).toEqual({ rebuilt: false })

    const resultAgain = await ensureEmbeddingTable(client, 1536)
    expect(resultAgain).toEqual({ rebuilt: false })

    const tables = await client.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vec_model_embeddings_1536'",
    )
    expect(tables).toHaveLength(1)
  })

  test('ensureEmbeddingTable never drops rows when dimensions change (non-destructive)', async () => {
    const files = new ModelFileRepository(client)
    const repository = new EmbeddingRepository(client)

    const file1 = await files.upsertModelFile(scannedFile('model1.stl'), 'p1')
    await repository.upsert({
      modelFileId: file1.id,
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      embedding: vector(1536, 1),
      sourceText: 'keep 1536',
    })

    const { rebuilt } = await ensureEmbeddingTable(client, 384)
    expect(rebuilt).toBe(false)
    expect(await repository.countEmbeddings()).toBe(1)

    const file2 = await files.upsertModelFile(scannedFile('model2.stl'), 'p1')
    await repository.upsert({
      modelFileId: file2.id,
      provider: 'builtin',
      model: 'minilm',
      dimensions: 384,
      embedding: vector(384, 2),
      sourceText: 'coexist 384',
    })

    expect(await repository.countEmbeddings()).toBe(2)
  })

  test('per-dimension vec0 table is keyed by model_file_id and supports cosine search', async () => {
    await ensureEmbeddingTable(client, 384)

    const v1 = new Float32Array(vector(384, 1))
    const v2 = new Float32Array(vector(384, 2))

    await client.run(
      'INSERT INTO vec_model_embeddings_384 (model_file_id, embedding) VALUES (?, ?)',
      ['file-1', v1],
    )
    await client.run(
      'INSERT INTO vec_model_embeddings_384 (model_file_id, embedding) VALUES (?, ?)',
      ['file-2', v2],
    )

    const results = await client.all<{ model_file_id: string; distance: number }>(
      'SELECT model_file_id, distance FROM vec_model_embeddings_384 WHERE embedding MATCH ? AND k = 1',
      [v1],
    )
    expect(results).toHaveLength(1)
    expect(results[0].model_file_id).toBe('file-1')
    expect(Number(results[0].distance)).toBeCloseTo(0)
  })

  test('behavior without sqlite-vec', async () => {
    const noVecClient = await SqliteClient.open(':memory:', { enableVec: false })
    try {
      expect(noVecClient.vecAvailable).toBe(false)
      await expect(ensureVecTable(noVecClient, 384)).rejects.toThrow(
        'sqlite-vec extension is not available',
      )
      const res = await ensureEmbeddingTable(noVecClient, 384)
      expect(res.rebuilt).toBe(false)
    } finally {
      await noVecClient.close()
    }
  })

  test('getEmbeddingTableDimensions returns undefined when empty or most recent row dimensions', async () => {
    expect(await getEmbeddingTableDimensions(client)).toBeUndefined()

    const files = new ModelFileRepository(client)
    const repository = new EmbeddingRepository(client)

    const file1 = await files.upsertModelFile(scannedFile('model1.stl'), 'p1')
    await repository.upsert({
      modelFileId: file1.id,
      provider: 'builtin',
      model: 'minilm',
      dimensions: 384,
      embedding: vector(384, 1),
      sourceText: 'text 1',
    })
    expect(await getEmbeddingTableDimensions(client)).toBe(384)
  })

  test('clearEmbeddings removes all records from model_embeddings', async () => {
    const files = new ModelFileRepository(client)
    const repository = new EmbeddingRepository(client)

    const file = await files.upsertModelFile(scannedFile('model.stl'), 'p1')
    await repository.upsert({
      modelFileId: file.id,
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      embedding: vector(1536, 1),
      sourceText: 'text',
    })
    expect(await repository.countEmbeddings()).toBe(1)

    await clearEmbeddings(client)
    expect(await repository.countEmbeddings()).toBe(0)
  })

  test('ensureEmbeddingTable returns { rebuilt: false } when dimensions <= 0', async () => {
    expect(await ensureEmbeddingTable(client, 0)).toEqual({ rebuilt: false })
    expect(await ensureEmbeddingTable(client, -1)).toEqual({ rebuilt: false })
  })
})
