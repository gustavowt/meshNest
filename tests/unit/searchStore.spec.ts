import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { resetSearchStore, useSearchStore } from '@/stores/searchStore'
import type { MeshNestApi } from '@/types/electronApi'
import type { SearchResult } from '@/types/search'

function result(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    modelFileId: 'id-1',
    filename: 'dragon.stl',
    absolutePath: '/models/dragon.stl',
    extension: 'stl',
    tags: ['dragon'],
    distance: 0.2,
    score: 0.9,
    ...overrides,
  }
}

beforeEach(() => {
  resetSearchStore()
})

afterEach(() => {
  delete (window as { meshNest?: MeshNestApi }).meshNest
})

describe('searchStore', () => {
  test('runs a search and preserves the query and results', async () => {
    const captured: { embedding?: number[] } = {}
    window.meshNest = {
      searchByEmbedding: async (embedding: number[]) => {
        captured.embedding = embedding
        return [result()]
      },
    } as unknown as MeshNestApi

    const store = useSearchStore()
    await store.runSearch('dragon phone stand')

    expect(store.state.query).toBe('dragon phone stand')
    expect(store.state.results).toHaveLength(1)
    expect(store.state.searched).toBe(true)
    expect(store.state.error).toBeNull()
    // Query embedding was generated with the configured dimensions.
    expect(captured.embedding).toHaveLength(1536)
  })

  test('blank queries clear results without searching', async () => {
    window.meshNest = {
      searchByEmbedding: async () => {
        throw new Error('should not be called')
      },
    } as unknown as MeshNestApi

    const store = useSearchStore()
    await store.runSearch('   ')

    expect(store.state.results).toEqual([])
    expect(store.state.searched).toBe(false)
    expect(store.state.error).toBeNull()
  })

  test('captures backend errors (e.g. empty index) as error state', async () => {
    window.meshNest = {
      searchByEmbedding: async () => {
        throw new Error('No models have been indexed with embeddings yet.')
      },
    } as unknown as MeshNestApi

    const store = useSearchStore()
    await store.runSearch('dragon')

    expect(store.state.error).toContain('No models have been indexed')
    expect(store.state.results).toEqual([])
    expect(store.state.searched).toBe(true)
  })

  test('reports missing bridge', async () => {
    const store = useSearchStore()
    await store.runSearch('dragon')

    expect(store.state.error).toContain('desktop app')
  })

  test('refreshIndexStatus stores the embedding count', async () => {
    window.meshNest = {
      countEmbeddings: async () => 7,
    } as unknown as MeshNestApi

    const store = useSearchStore()
    await store.refreshIndexStatus()

    expect(store.state.embeddingCount).toBe(7)
  })
})
