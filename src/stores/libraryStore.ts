import { computed, reactive, readonly } from 'vue'
import type { LibraryEntry, LibrarySortKey } from '@/types/library'

type LibraryState = {
  entries: LibraryEntry[]
  loading: boolean
  error: string | null
  loaded: boolean
  sortKey: LibrarySortKey
}

const state = reactive<LibraryState>({
  entries: [],
  loading: false,
  error: null,
  loaded: false,
  sortKey: 'filename',
})

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
  [...state.entries].sort((a, b) => compareEntries(a, b, state.sortKey)),
)

async function loadLibrary(): Promise<void> {
  if (!window.meshNest) {
    state.error = 'The library is only available in the desktop app.'
    state.loaded = true
    return
  }
  state.loading = true
  state.error = null
  try {
    state.entries = await window.meshNest.listLibraryEntries()
    state.loaded = true
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
  } finally {
    state.loading = false
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

/** Test-only helper to restore a pristine store between specs. */
export function resetLibraryStore(): void {
  state.entries = []
  state.loading = false
  state.error = null
  state.loaded = false
  state.sortKey = 'filename'
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
    setSortKey,
    patchEntry,
  }
}
