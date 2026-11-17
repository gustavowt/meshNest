import { computed, reactive, readonly } from 'vue'
import type { LibraryEntry, LibrarySortKey } from '@/types/library'

const CACHE_VERSION = 1
const STORAGE_KEY = 'meshnest.libraryCache.v1'

type CachedLibrary = {
  version: typeof CACHE_VERSION
  entries: LibraryEntry[]
}

type LibraryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function getStorage(): LibraryStorage | null {
  if (typeof window === 'undefined') {
    return null
  }
  const storage = window.localStorage
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function'
  ) {
    return null
  }
  return storage
}

export function loadCachedLibraryEntries(): LibraryEntry[] {
  const storage = getStorage()
  if (!storage) {
    return []
  }
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as Partial<CachedLibrary>
    if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.entries)) {
      return []
    }
    return parsed.entries
  } catch {
    return []
  }
}

export function saveCachedLibraryEntries(entries: LibraryEntry[]): void {
  const storage = getStorage()
  if (!storage) {
    return
  }
  try {
    const payload: CachedLibrary = {
      version: CACHE_VERSION,
      entries,
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (error) {
    console.warn('Failed to cache library entries:', error)
  }
}

export function clearCachedLibraryEntries(): void {
  const storage = getStorage()
  if (!storage) {
    return
  }
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage clear issues
  }
}

type LibraryState = {
  entries: LibraryEntry[]
  loading: boolean
  error: string | null
  loaded: boolean
  sortKey: LibrarySortKey
}

const initialCachedEntries = loadCachedLibraryEntries()

const state = reactive<LibraryState>({
  entries: initialCachedEntries,
  loading: false,
  error: null,
  loaded: initialCachedEntries.length > 0,
  sortKey: 'filename',
})
const pinnedEntryIds: string[] = []

export function hydrateFromCache(): void {
  const cached = loadCachedLibraryEntries()
  if (cached.length > 0) {
    state.entries = cached
    state.loaded = true
  }
}

function compareEntries(a: LibraryEntry, b: LibraryEntry, key: LibrarySortKey): number {
  switch (key) {
    case 'filename':
      return a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0
    case 'modifiedAt':
      // Newest first.
      return b.modifiedAt.localeCompare(a.modifiedAt)
    case 'indexedAt': {
      // Newest first; files without an indexed date sink to the bottom.
      if (!a.indexedAt && !b.indexedAt) return 0
      if (!a.indexedAt) return 1
      if (!b.indexedAt) return -1
      return b.indexedAt.localeCompare(a.indexedAt)
    }
  }
}

const sortedEntries = computed(() =>
  [...state.entries].sort((a, b) => {
    const pinnedA = pinnedEntryIds.indexOf(a.id)
    const pinnedB = pinnedEntryIds.indexOf(b.id)
    if (pinnedA !== -1 || pinnedB !== -1) {
      if (pinnedA === -1) return 1
      if (pinnedB === -1) return -1
      return pinnedA - pinnedB
    }
    return compareEntries(a, b, state.sortKey)
  }),
)

async function loadLibrary(options: { silent?: boolean } = {}): Promise<void> {
  if (!window.meshNest) {
    state.error = 'The library is only available in the desktop app.'
    state.loaded = true
    return
  }
  if (!options.silent) {
    state.loading = true
  }
  state.error = null
  try {
    const freshEntries = await window.meshNest.listLibraryEntries()
    state.entries = freshEntries
    state.loaded = true
    saveCachedLibraryEntries(freshEntries)
  } catch (error) {
    if (options.silent && state.entries.length > 0) {
      console.warn('Silent library refresh failed; retaining cached entries:', error)
    } else {
      state.error = error instanceof Error ? error.message : String(error)
    }
  } finally {
    if (!options.silent) {
      state.loading = false
    }
  }
}

function upsertEntry(entry: LibraryEntry): void {
  const index = state.entries.findIndex(
    (candidate) =>
      candidate.id === entry.id ||
      candidate.absolutePath === entry.absolutePath ||
      candidate.relativePath === entry.relativePath,
  )
  if (index >= 0) {
    state.entries[index] = entry
  } else {
    state.entries.push(entry)
  }
  state.loaded = true
  saveCachedLibraryEntries(state.entries)
}

async function refreshEntry(modelFileId: string): Promise<LibraryEntry | null> {
  if (!window.meshNest) {
    return null
  }
  try {
    const entry = await window.meshNest.getLibraryEntry(modelFileId)
    if (entry) {
      upsertEntry(entry)
    }
    return entry
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
    return null
  }
}

function setSortKey(key: LibrarySortKey): void {
  state.sortKey = key
}

function patchEntry(
  id: string,
  patch: Partial<Pick<LibraryEntry, 'absolutePath' | 'relativePath' | 'filename' | 'shortName'>>,
): void {
  const index = state.entries.findIndex((entry) => entry.id === id)
  if (index >= 0) {
    state.entries[index] = { ...state.entries[index], ...patch }
  }
}

function pinEntryFirst(id: string): void {
  const existingIndex = pinnedEntryIds.indexOf(id)
  if (existingIndex >= 0) {
    pinnedEntryIds.splice(existingIndex, 1)
  }
  pinnedEntryIds.unshift(id)
}

/** Test-only helper to restore a pristine store between specs. */
export function resetLibraryStore(): void {
  clearCachedLibraryEntries()
  state.entries = []
  state.loading = false
  state.error = null
  state.loaded = false
  state.sortKey = 'filename'
  pinnedEntryIds.splice(0)
}

/**
 * Shared library state (module singleton). Components read reactive
 * state and call actions; the store owns all bridge access.
 */
export function useLibraryStore() {
  return {
    state: readonly(state),
    sortedEntries,
    loadLibrary,
    refreshEntry,
    setSortKey,
    patchEntry,
    pinEntryFirst,
    hydrateFromCache,
  }
}
