import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { resetWorldSearchStore, useWorldSearchStore } from '@/stores/worldSearchStore'
import type { MeshNestApi } from '@/types/electronApi'

beforeEach(() => {
  resetWorldSearchStore()
})

afterEach(() => {
  delete (window as { meshNest?: MeshNestApi }).meshNest
})

describe('worldSearchStore', () => {
  test('runs a world search and stores results', async () => {
    window.meshNest = {
      worldSearch: async () => ({
        query: 'benchy',
        results: [
          {
            id: 'sketchfab:1',
            providerId: 'sketchfab',
            sourceId: '1',
            title: 'Benchy',
            sourceUrl: 'https://sketchfab.com/3d-models/benchy',
            score: 0.9,
          },
        ],
        providerErrors: [],
      }),
    } as unknown as MeshNestApi

    const store = useWorldSearchStore()
    await store.runSearch('benchy')

    expect(store.state.query).toBe('benchy')
    expect(store.state.results).toHaveLength(1)
    expect(store.state.searched).toBe(true)
    expect(store.state.error).toBeNull()
  })

  test('captures backend errors', async () => {
    window.meshNest = {
      worldSearch: async () => {
        throw new Error('Network unavailable')
      },
    } as unknown as MeshNestApi

    const store = useWorldSearchStore()
    await store.runSearch('dragon')

    expect(store.state.results).toEqual([])
    expect(store.state.error).toBe('Network unavailable')
  })
})
