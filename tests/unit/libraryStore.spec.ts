import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { resetLibraryStore, useLibraryStore } from '@/stores/libraryStore'
import type { LibraryEntry } from '@/types/library'
import type { MeshNestApi } from '@/types/electronApi'

function entry(overrides: Partial<LibraryEntry>): LibraryEntry {
  return {
    id: crypto.randomUUID(),
    filename: 'model.stl',
    relativePath: 'model.stl',
    absolutePath: '/models/model.stl',
    extension: 'stl',
    sizeBytes: 100,
    modifiedAt: '2026-06-01T10:00:00.000Z',
    status: 'indexed',
    tags: [],
    ...overrides,
  }
}

beforeEach(() => {
  resetLibraryStore()
})

afterEach(() => {
  delete (window as { meshNest?: MeshNestApi }).meshNest
})

describe('libraryStore', () => {
  test('loads entries through the bridge', async () => {
    const entries = [entry({ filename: 'a.stl' })]
    window.meshNest = {
      listLibraryEntries: async () => entries,
    } as unknown as MeshNestApi

    const store = useLibraryStore()
    await store.loadLibrary()

    expect(store.state.loaded).toBe(true)
    expect(store.state.entries).toHaveLength(1)
    expect(store.state.error).toBeNull()
  })

  test('reports an error when the bridge is missing', async () => {
    const store = useLibraryStore()
    await store.loadLibrary()

    expect(store.state.error).toContain('desktop app')
    expect(store.state.loaded).toBe(true)
  })

  test('captures bridge failures as error state', async () => {
    window.meshNest = {
      listLibraryEntries: async () => {
        throw new Error('database unavailable')
      },
    } as unknown as MeshNestApi

    const store = useLibraryStore()
    await store.loadLibrary()

    expect(store.state.error).toBe('database unavailable')
    expect(store.state.loading).toBe(false)
  })

  test('sorts by filename ascending', async () => {
    window.meshNest = {
      listLibraryEntries: async () => [
        entry({ filename: 'zebra.stl' }),
        entry({ filename: 'apple.stl' }),
      ],
    } as unknown as MeshNestApi

    const store = useLibraryStore()
    await store.loadLibrary()
    store.setSortKey('filename')

    expect(store.sortedEntries.value.map((e) => e.filename)).toEqual(['apple.stl', 'zebra.stl'])
  })

  test('sorts by modified date, newest first', async () => {
    window.meshNest = {
      listLibraryEntries: async () => [
        entry({ filename: 'old.stl', modifiedAt: '2026-01-01T00:00:00.000Z' }),
        entry({ filename: 'new.stl', modifiedAt: '2026-06-01T00:00:00.000Z' }),
      ],
    } as unknown as MeshNestApi

    const store = useLibraryStore()
    await store.loadLibrary()
    store.setSortKey('modifiedAt')

    expect(store.sortedEntries.value.map((e) => e.filename)).toEqual(['new.stl', 'old.stl'])
  })

  test('sorts by indexed date with unindexed files last', async () => {
    window.meshNest = {
      listLibraryEntries: async () => [
        entry({ filename: 'never.stl', status: 'failed', indexedAt: undefined }),
        entry({ filename: 'early.stl', indexedAt: '2026-02-01T00:00:00.000Z' }),
        entry({ filename: 'late.stl', indexedAt: '2026-06-01T00:00:00.000Z' }),
      ],
    } as unknown as MeshNestApi

    const store = useLibraryStore()
    await store.loadLibrary()
    store.setSortKey('indexedAt')

    expect(store.sortedEntries.value.map((e) => e.filename)).toEqual([
      'late.stl',
      'early.stl',
      'never.stl',
    ])
  })

  test('pins a recently added entry before the active sort order', async () => {
    const pinnedId = crypto.randomUUID()
    window.meshNest = {
      listLibraryEntries: async () => [
        entry({ id: pinnedId, filename: 'zebra.stl' }),
        entry({ filename: 'apple.stl' }),
      ],
    } as unknown as MeshNestApi

    const store = useLibraryStore()
    await store.loadLibrary()
    store.setSortKey('filename')
    store.pinEntryFirst(pinnedId)

    expect(store.sortedEntries.value.map((e) => e.filename)).toEqual(['zebra.stl', 'apple.stl'])
  })

  test('patches a single entry in place', async () => {
    const id = crypto.randomUUID()
    window.meshNest = {
      listLibraryEntries: async () => [
        entry({ id, filename: 'old-name.3mf', absolutePath: '/models/old-name.3mf' }),
      ],
    } as unknown as MeshNestApi

    const store = useLibraryStore()
    await store.loadLibrary()
    store.patchEntry(id, {
      filename: 'new-name.3mf',
      absolutePath: '/models/new-name.3mf',
      relativePath: 'new-name.3mf',
      shortName: 'new name',
    })

    expect(store.state.entries[0].absolutePath).toBe('/models/new-name.3mf')
    expect(store.state.entries[0].shortName).toBe('new name')
  })
})
