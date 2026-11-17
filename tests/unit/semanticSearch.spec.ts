// Uses jsdom (default): shared indexing helpers import the 3MF loader chain.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { AiDescriptionRepository } from '@/services/database/aiDescriptionRepository'
import { EmbeddingRepository } from '@/services/database/embeddingRepository'
import { runMigrations } from '@/services/database/migrations'
import { EMBEDDING_DIMENSIONS } from '@/services/database/schema'
import { NoEmbeddingsError, SearchRepository } from '@/services/database/searchRepository'
import { SqliteClient } from '@/services/database/sqliteClient'
import { indexModelFile } from '@/services/indexing/indexModelFile'
import { MockEmbeddingProvider } from '@/services/llm/mockEmbeddingProvider'
import { MockVisionProvider } from '@/services/llm/mockVisionProvider'
import { semanticSearch } from '@/services/search/semanticSearch'
import type { SemanticSearchDeps } from '@/services/search/semanticSearch'
import {
  createTestBackend,
  fakeRenderViews,
  writeScannedFile,
} from './helpers/indexingTestUtils'
import { buildBinaryStl, SPANNING_TRIANGLES } from './helpers/stlFixtures'
import type { AIModelDescription } from '@/types/llm'

const PROJECT_ID = 'project-1'

let filesDir: string
let rendersDir: string
let client: SqliteClient
let repository: SearchRepository
let deps: SemanticSearchDeps

beforeAll(() => {
  filesDir = mkdtempSync(join(tmpdir(), 'meshnest-search-files-'))
  rendersDir = mkdtempSync(join(tmpdir(), 'meshnest-search-renders-'))
})

afterAll(() => {
  rmSync(filesDir, { recursive: true, force: true })
  rmSync(rendersDir, { recursive: true, force: true })
})

beforeEach(async () => {
  client = await SqliteClient.open(':memory:')
  await runMigrations(client)
  repository = new SearchRepository(client)
  deps = {
    embeddingProvider: new MockEmbeddingProvider(),
    searchByEmbedding: (embedding, options) => repository.searchByEmbedding(embedding, options),
  }
})

afterEach(async () => {
  await client.close()
})

async function indexFixture(filename: string) {
  const content = new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES))
  const header = new TextEncoder().encode(filename)
  content.set(header.slice(0, 80), 0)
  const file = writeScannedFile(
    filesDir,
    filename,
    content,
  )
  return indexModelFile(file, PROJECT_ID, {
    backend: createTestBackend(client, rendersDir),
    visionProvider: new MockVisionProvider(),
    embeddingProvider: new MockEmbeddingProvider(),
    renderViews: fakeRenderViews,
  })
}

function vectorWithCosine(cosine: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0)
  vector[0] = cosine
  vector[1] = Math.sqrt(1 - cosine * cosine)
  return vector
}

async function insertSearchFixture(
  id: string,
  filename: string,
  description: AIModelDescription,
  embedding: number[],
): Promise<void> {
  const extension = filename.split('.').pop() ?? 'stl'
  await client.run(
    `INSERT INTO model_files (
       id, project_id, absolute_path, relative_path, filename, extension,
       size_bytes, modified_at, content_hash, status
     ) VALUES (
       @id, @projectId, @absolutePath, @relativePath, @filename, @extension,
       1, @modifiedAt, @contentHash, 'indexed'
     )`,
    {
      id,
      projectId: PROJECT_ID,
      absolutePath: join(filesDir, filename),
      relativePath: filename,
      filename,
      extension,
      modifiedAt: '2026-06-01T12:00:00.000Z',
      contentHash: `hash-${id}`,
    },
  )
  await new AiDescriptionRepository(client).upsert(
    id,
    description,
    JSON.stringify(description),
  )
  await new EmbeddingRepository(client).upsert({
    modelFileId: id,
    provider: 'test',
    model: 'test-embedding',
    dimensions: EMBEDDING_DIMENSIONS,
    embedding,
    sourceText: [
      `Short name: ${description.shortName}`,
      `Description: ${description.description}`,
      `Tags: ${description.tags.join(', ')}`,
      `Search phrases: ${description.searchPhrases.join('; ')}`,
    ].join('\n'),
  })
}

describe('semanticSearch', () => {
  test('ranks the semantically closest model first', async () => {
    await indexFixture('dragon-phone-stand.stl')
    await indexFixture('storage-box-lid.stl')
    await indexFixture('benchy-boat.stl')

    const results = await semanticSearch('dragon phone stand', deps)

    expect(results.length).toBe(3)
    expect(results[0].filename).toBe('dragon-phone-stand.stl')
    // Sorted by ascending distance.
    const distances = results.map((r) => r.distance)
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
  })

  test('results include metadata, thumbnail, distance, and score', async () => {
    await indexFixture('dragon-phone-stand.stl')

    const [result] = await semanticSearch('dragon stand', deps)

    expect(result.shortName).toBe('dragon phone stand')
    expect(result.likelyCategory).toBeTruthy()
    expect(result.tags.length).toBeGreaterThan(0)
    expect(result.description).toBeTruthy()
    expect(result.thumbnailPath).toContain('thumbnail.png')
    expect(result.distance).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeGreaterThan(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })

  test('respects the limit option', async () => {
    await indexFixture('one.stl')
    await indexFixture('two.stl')
    await indexFixture('three.stl')

    const results = await semanticSearch('model', deps, { limit: 2 })
    expect(results).toHaveLength(2)
  })

  test('boosts direct Portuguese keyword matches over weaker vector-only hits', async () => {
    const queryEmbedding = vectorWithCosine(1)
    await insertSearchFixture(
      'generic-vector-hit',
      'headphone-stand.stl',
      {
        shortName: 'Suporte de Fone de Ouvido',
        description: 'Um suporte decorativo para organizar fones de ouvido na mesa.',
        likelyCategory: 'organização',
        tags: ['suporte', 'organizador'],
        objectsDetected: ['suporte'],
        confidence: 0.9,
        searchPhrases: ['suporte para fone', 'organizador de mesa'],
      },
      vectorWithCosine(1),
    )
    await insertSearchFixture(
      'articulated-model',
      'axolotl-keychain.stl',
      {
        shortName: 'Chaveiro de Axolote Articulado',
        description: 'Um axolote estilizado com juntas móveis para impressão print-in-place.',
        likelyCategory: 'brinquedos',
        tags: ['axolote', 'articulado', 'chaveiro'],
        objectsDetected: ['axolote'],
        confidence: 0.9,
        searchPhrases: ['axolote articulado 3d', 'chaveiro de animal articulado'],
      },
      vectorWithCosine(0.8),
    )

    const results = await repository.searchByEmbedding(queryEmbedding, { queryText: 'articulado' })

    expect(results[0].filename).toBe('axolotl-keychain.stl')
    expect(results[0].shortName).toBe('Chaveiro de Axolote Articulado')
    expect(results[1].filename).toBe('headphone-stand.stl')
  })

  test('finds models with specific filename keyword match even when vector distance is distant', async () => {
    await insertSearchFixture(
      'distant-model',
      '5D Model.3mf',
      {
        shortName: '5D Calibration Print',
        description: 'An experimental print for calibration and testing.',
        likelyCategory: 'tools',
        tags: ['calibration', 'test'],
        objectsDetected: ['tool'],
        confidence: 0.9,
        searchPhrases: ['calibration test'],
      },
      vectorWithCosine(0.1),
    )
    await insertSearchFixture(
      'cube-model',
      'cube.stl',
      {
        shortName: 'Geometric Cube',
        description: 'A simple geometric cube.',
        likelyCategory: 'geometry',
        tags: ['cube', 'shape'],
        objectsDetected: ['cube'],
        confidence: 0.9,
        searchPhrases: ['geometric cube'],
      },
      vectorWithCosine(0.9),
    )

    const results = await repository.searchByEmbedding(vectorWithCosine(0.9), {
      queryText: 'model',
    })

    const matched = results.find((r) => r.filename === '5D Model.3mf')
    expect(matched).toBeDefined()
    expect(matched!.score).toBeGreaterThan(0.7)
    expect(results[0].filename).toBe('5D Model.3mf')
  })

  test('returns an empty list for blank queries without touching the index', async () => {
    const results = await semanticSearch('   ', deps)
    expect(results).toEqual([])
  })

  test('returns an empty list when embedding provider is set to none', async () => {
    const customDeps = {
      ...deps,
      embeddingProvider: {
        name: 'none',
        model: '',
        dimensions: 0,
        embedText: async () => {
          throw new Error('Should not be called')
        }
      }
    }
    const results = await semanticSearch('query', customDeps)
    expect(results).toEqual([])
  })

  test('throws NoEmbeddingsError when nothing is indexed', async () => {
    await expect(semanticSearch('dragon', deps)).rejects.toBeInstanceOf(NoEmbeddingsError)
  })

  test('rejects query embeddings with mismatched dimensions', async () => {
    await indexFixture('any.stl')
    await expect(repository.searchByEmbedding([0.1, 0.2])).rejects.toThrow()
  })

  test('filters by project id', async () => {
    await indexFixture('dragon.stl')

    const embedding = await deps.embeddingProvider.embedText('dragon')
    const inProject = await repository.searchByEmbedding(embedding, { projectId: PROJECT_ID })
    const otherProject = await repository.searchByEmbedding(embedding, { projectId: 'other' })

    expect(inProject).toHaveLength(1)
    expect(otherProject).toHaveLength(0)
  })
})
