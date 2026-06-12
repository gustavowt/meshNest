// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { DuckDbClient } from '@/services/database/duckdbClient'
import {
  EmbeddingDimensionError,
  EmbeddingRepository,
} from '@/services/database/embeddingRepository'
import { runMigrations } from '@/services/database/migrations'
import { EMBEDDING_DIMENSIONS } from '@/services/database/schema'
import { buildEmbeddingSourceText } from '@/services/llm/embeddingProvider'
import { MockEmbeddingProvider } from '@/services/llm/mockEmbeddingProvider'
import type { AIModelDescription } from '@/types/llm'

const description: AIModelDescription = {
  shortName: 'dragon phone stand',
  description: 'A dragon-shaped phone stand.',
  likelyCategory: 'household',
  tags: ['dragon', 'stand'],
  objectsDetected: ['dragon'],
  printUse: 'desk accessory',
  style: 'fantasy',
  confidence: 0.8,
  searchPhrases: ['dragon phone stand', 'fantasy stand'],
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
  }
  return dot
}

describe('buildEmbeddingSourceText', () => {
  test('produces the documented stable format', () => {
    const text = buildEmbeddingSourceText(description)
    expect(text).toBe(
      [
        'Short name: dragon phone stand',
        'Description: A dragon-shaped phone stand.',
        'Category: household',
        'Tags: dragon, stand',
        'Objects detected: dragon',
        'Print use: desk accessory',
        'Style: fantasy',
        'Search phrases: dragon phone stand; fantasy stand',
      ].join('\n'),
    )
  })

  test('omits optional lines when absent', () => {
    const text = buildEmbeddingSourceText({ ...description, printUse: undefined, style: undefined })
    expect(text).not.toContain('Print use:')
    expect(text).not.toContain('Style:')
  })
})

describe('MockEmbeddingProvider', () => {
  const provider = new MockEmbeddingProvider()

  test('returns vectors matching the database dimension', async () => {
    const vector = await provider.embedText('a dragon phone stand')
    expect(provider.dimensions).toBe(EMBEDDING_DIMENSIONS)
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS)
  })

  test('is deterministic and normalized', async () => {
    const first = await provider.embedText('gridfinity container')
    const second = await provider.embedText('gridfinity container')
    expect(second).toEqual(first)

    const norm = Math.sqrt(first.reduce((sum, v) => sum + v * v, 0))
    expect(norm).toBeCloseTo(1, 5)
  })

  test('related texts are closer than unrelated texts', async () => {
    const query = await provider.embedText('dragon phone stand')
    const related = await provider.embedText('a phone stand shaped like a dragon')
    const unrelated = await provider.embedText('hex wrench replacement bolt')

    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated))
  })

  test('handles empty text without producing a zero vector', async () => {
    const vector = await provider.embedText('')
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
    expect(norm).toBeGreaterThan(0)
  })
})

describe('EmbeddingRepository', () => {
  let client: DuckDbClient
  let repository: EmbeddingRepository

  beforeEach(async () => {
    client = await DuckDbClient.open(':memory:')
    await runMigrations(client)
    repository = new EmbeddingRepository(client)
  })

  afterEach(async () => {
    await client.close()
  })

  test('stores and reloads embeddings with provider info and source text', async () => {
    const provider = new MockEmbeddingProvider()
    const sourceText = buildEmbeddingSourceText(description)
    const vector = await provider.embedText(sourceText)

    await repository.upsert({
      modelFileId: 'file-1',
      provider: provider.name,
      model: provider.model,
      dimensions: provider.dimensions,
      embedding: vector,
      sourceText,
    })

    const stored = await repository.getByModelFileId('file-1')
    expect(stored?.provider).toBe('mock')
    expect(stored?.model).toBe('mock-embedding-1')
    expect(stored?.dimensions).toBe(EMBEDDING_DIMENSIONS)
    expect(stored?.sourceText).toBe(sourceText)
    expect(stored?.embedding).toHaveLength(EMBEDDING_DIMENSIONS)
    expect(await repository.countEmbeddings()).toBe(1)

    // Values must survive the roundtrip (float32 precision), not just the
    // shape: DuckDB list inference once truncated sparse vectors to zeros.
    const storedNorm = Math.sqrt(stored!.embedding.reduce((sum, v) => sum + v * v, 0))
    expect(storedNorm).toBeCloseTo(1, 3)
    for (const [index, value] of vector.entries()) {
      if (value !== 0) {
        expect(stored!.embedding[index]).toBeCloseTo(value, 4)
      }
    }
  })

  test('rejects embeddings with mismatched dimensions', async () => {
    await expect(
      repository.upsert({
        modelFileId: 'file-1',
        provider: 'mock',
        model: 'mock',
        dimensions: 3,
        embedding: [1, 2, 3],
        sourceText: 'short',
      }),
    ).rejects.toBeInstanceOf(EmbeddingDimensionError)
  })

  test('upsert replaces an existing embedding', async () => {
    const provider = new MockEmbeddingProvider()
    const base = {
      modelFileId: 'file-1',
      provider: provider.name,
      model: provider.model,
      dimensions: provider.dimensions,
    }
    await repository.upsert({ ...base, embedding: await provider.embedText('first'), sourceText: 'first' })
    await repository.upsert({ ...base, embedding: await provider.embedText('second'), sourceText: 'second' })

    const stored = await repository.getByModelFileId('file-1')
    expect(stored?.sourceText).toBe('second')
    expect(await repository.countEmbeddings()).toBe(1)
  })
})
