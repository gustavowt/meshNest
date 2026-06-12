import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { DuckDbClient } from '@/services/database/duckdbClient'
import { runMigrations } from '@/services/database/migrations'
import { EmbeddingRepository } from '@/services/database/embeddingRepository'
import {
  ensureEmbeddingTable,
  getEmbeddingTableDimensions,
} from '@/services/database/embeddingTable'
import { ModelFileRepository } from '@/services/database/modelFileRepository'
import { SearchRepository } from '@/services/database/searchRepository'
import type { ScannedFile } from '@/types/modelFile'

let client: DuckDbClient

beforeEach(async () => {
  client = await DuckDbClient.open(':memory:')
  await runMigrations(client)
})

afterEach(async () => {
  await client.close()
})

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

describe('embedding table dimensions', () => {
  test('initial migration creates the default 1536-wide table', async () => {
    expect(await getEmbeddingTableDimensions(client)).toBe(1536)
  })

  test('ensureEmbeddingTable keeps a matching table untouched', async () => {
    const repository = new EmbeddingRepository(client)
    const files = new ModelFileRepository(client)
    const record = await files.upsertModelFile(scannedFile('keep.stl'), 'p1')
    await repository.upsert({
      modelFileId: record.id,
      provider: 'mock',
      model: 'm',
      dimensions: 1536,
      embedding: vector(1536, 1),
      sourceText: 'keep',
    })

    const { rebuilt } = await ensureEmbeddingTable(client, 1536)
    expect(rebuilt).toBe(false)
    expect(await repository.countEmbeddings()).toBe(1)
  })

  test('ensureEmbeddingTable rebuilds (and clears) when dimensions change', async () => {
    const repository = new EmbeddingRepository(client)
    const files = new ModelFileRepository(client)
    const record = await files.upsertModelFile(scannedFile('drop.stl'), 'p1')
    await repository.upsert({
      modelFileId: record.id,
      provider: 'mock',
      model: 'm',
      dimensions: 1536,
      embedding: vector(1536, 2),
      sourceText: 'drop',
    })

    const { rebuilt } = await ensureEmbeddingTable(client, 384)
    expect(rebuilt).toBe(true)
    expect(await getEmbeddingTableDimensions(client)).toBe(384)
    expect(await repository.countEmbeddings()).toBe(0)
  })

  test('embeddings round-trip and search work at 384 dimensions', async () => {
    await ensureEmbeddingTable(client, 384)
    const repository = new EmbeddingRepository(client)
    const files = new ModelFileRepository(client)

    const a = await files.upsertModelFile(scannedFile('a.stl'), 'p1')
    const b = await files.upsertModelFile(scannedFile('b.stl'), 'p1')
    const target = vector(384, 7)
    await repository.upsert({
      modelFileId: a.id,
      provider: 'builtin',
      model: 'minilm',
      dimensions: 384,
      embedding: target,
      sourceText: 'a',
    })
    await repository.upsert({
      modelFileId: b.id,
      provider: 'builtin',
      model: 'minilm',
      dimensions: 384,
      embedding: vector(384, 99),
      sourceText: 'b',
    })

    const results = await new SearchRepository(client).searchByEmbedding(target)
    expect(results[0].modelFileId).toBe(a.id)
    expect(results[0].score).toBeGreaterThan(0.99)
  })

  test('upsert rejects vectors that do not match the table width', async () => {
    await ensureEmbeddingTable(client, 384)
    const repository = new EmbeddingRepository(client)
    const files = new ModelFileRepository(client)
    const record = await files.upsertModelFile(scannedFile('bad.stl'), 'p1')

    await expect(
      repository.upsert({
        modelFileId: record.id,
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimensions: 1536,
        embedding: vector(1536, 3),
        sourceText: 'bad',
      }),
    ).rejects.toThrow(/1536 dimensions but the database table expects 384/)
  })

  test('search rejects query vectors that do not match the table width', async () => {
    await ensureEmbeddingTable(client, 384)
    const repository = new EmbeddingRepository(client)
    const files = new ModelFileRepository(client)
    const record = await files.upsertModelFile(scannedFile('q.stl'), 'p1')
    await repository.upsert({
      modelFileId: record.id,
      provider: 'builtin',
      model: 'minilm',
      dimensions: 384,
      embedding: vector(384, 5),
      sourceText: 'q',
    })

    await expect(new SearchRepository(client).searchByEmbedding(vector(1536, 5))).rejects.toThrow(
      /database table expects 384/,
    )
  })
})
