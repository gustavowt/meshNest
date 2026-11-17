import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  hydrateFromCache,
  loadCachedLibraryEntries,
  resetLibraryStore,
  saveCachedLibraryEntries,
  useLibraryStore,
} from '@/stores/libraryStore'
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

function installLocalStorageMock(): void {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
      removeItem: (key: string) => {
        values.delete(key)
      },
      clear: () => {
        values.clear()
      },
    },
  })
}

beforeEach(() => {
  installLocalStorageMock()
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

  test('refreshes one entry without entering the full loading state', async () => {
    const first = entry({ id: 'model-1', filename: 'first.stl' })
    const updated = entry({ id: 'model-1', filename: 'updated.stl', shortName: 'Updated' })
    window.meshNest = {
      listLibraryEntries: async () => [first],
      getLibraryEntry: async () => updated,
    } as unknown as MeshNestApi

    const store = useLibraryStore()
    await store.loadLibrary()
    await store.refreshEntry('model-1')

    expect(store.state.loading).toBe(false)
    expect(store.state.entries).toHaveLength(1)
    expect(store.state.entries[0].filename).toBe('updated.stl')
    expect(store.state.entries[0].shortName).toBe('Updated')
  })

  test('refresh upserts by file path when a reindexed entry has a new id', async () => {
    const original = entry({
      id: 'old-id',
      filename: 'same-file.stl',
      relativePath: 'same-file.stl',
      absolutePath: '/models/same-file.stl',
    })
    const reindexed = entry({
      id: 'new-id',
      filename: 'same-file.stl',
      relativePath: 'same-file.stl',
      absolutePath: '/models/same-file.stl',
      shortName: 'Same File',
    })
    window.meshNest = {
      listLibraryEntries: async () => [original],
      getLibraryEntry: async () => reindexed,
    } as unknown as MeshNestApi

    const store = useLibraryStore()
    await store.loadLibrary()
    await store.refreshEntry('new-id')

    expect(store.state.entries).toHaveLength(1)
    expect(store.state.entries[0].id).toBe('new-id')
    expect(store.state.entries[0].shortName).toBe('Same File')
  })

  test('can reconcile silently without hiding the current list', async () => {
    let resolveEntries: ((entries: LibraryEntry[]) => void) | null = null
    window.meshNest = {
      listLibraryEntries: () =>
        new Promise<LibraryEntry[]>((resolve) => {
          resolveEntries = resolve
        }),
    } as unknown as MeshNestApi

    const store = useLibraryStore()
    const load = store.loadLibrary({ silent: true })

    expect(store.state.loading).toBe(false)
    resolveEntries?.([entry({ filename: 'silent.stl' })])
    await load

    expect(store.state.entries[0].filename).toBe('silent.stl')
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

  test('caches fresh entries to localStorage when loadLibrary runs', async () => {
    const entries = [entry({ id: 'model-cache-1', filename: 'cached.stl' })]
    window.meshNest = {
      listLibraryEntries: async () => entries,
    } as unknown as MeshNestApi

    const store = useLibraryStore()
    await store.loadLibrary()

    const cached = loadCachedLibraryEntries()
    expect(cached).toHaveLength(1)
    expect(cached[0].id).toBe('model-cache-1')
    expect(window.localStorage.getItem('meshnest.libraryCache.v1')).toContain('model-cache-1')
  })

  test('silent background refresh retains cached entries on bridge failure without showing error', async () => {
    const initial = [entry({ id: 'model-1', filename: 'initial.stl' })]
    window.meshNest = {
      listLibraryEntries: async () => initial,
    } as unknown as MeshNestApi

    const store = useLibraryStore()
    await store.loadLibrary()

    expect(store.state.entries).toHaveLength(1)
    expect(store.state.entries[0].filename).toBe('initial.stl')

    window.meshNest = {
      listLibraryEntries: async () => {
        throw new Error('database locked')
      },
    } as unknown as MeshNestApi

    await store.loadLibrary({ silent: true })

    expect(store.state.entries).toHaveLength(1)
    expect(store.state.entries[0].filename).toBe('initial.stl')
    expect(store.state.error).toBeNull()
    expect(store.state.loading).toBe(false)
  })

  test('hydrates entries from localStorage cache', () => {
    const cachedEntries = [entry({ id: 'hydrated-1', filename: 'hydrated.stl' })]
    saveCachedLibraryEntries(cachedEntries)

    expect(loadCachedLibraryEntries()).toHaveLength(1)

    const store = useLibraryStore()
    expect(store.state.entries).toHaveLength(0)

    hydrateFromCache()
    expect(store.state.entries).toHaveLength(1)
    expect(store.state.entries[0].id).toBe('hydrated-1')
    expect(store.state.loaded).toBe(true)

    resetLibraryStore()
    saveCachedLibraryEntries(cachedEntries)
    store.hydrateFromCache()
    expect(store.state.entries).toHaveLength(1)
  })
})
