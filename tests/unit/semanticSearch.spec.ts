// Uses jsdom (default): shared indexing helpers import the 3MF loader chain.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { DuckDbClient } from '@/services/database/duckdbClient'
import { EmbeddingDimensionError } from '@/services/database/embeddingRepository'
import { runMigrations } from '@/services/database/migrations'
import { NoEmbeddingsError, SearchRepository } from '@/services/database/searchRepository'
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

const PROJECT_ID = 'project-1'

let filesDir: string
let rendersDir: string
let client: DuckDbClient
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
  client = await DuckDbClient.open(':memory:')
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
  const file = writeScannedFile(
    filesDir,
    filename,
    new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES)),
  )
  return indexModelFile(file, PROJECT_ID, {
    backend: createTestBackend(client, rendersDir),
    visionProvider: new MockVisionProvider(),
    embeddingProvider: new MockEmbeddingProvider(),
    renderViews: fakeRenderViews,
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

  test('rejects query embeddings with the wrong dimensions', async () => {
    await indexFixture('any.stl')
    await expect(repository.searchByEmbedding([0.1, 0.2])).rejects.toBeInstanceOf(
      EmbeddingDimensionError,
    )
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
