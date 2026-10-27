import { reactive, readonly } from 'vue'
import { createBridgeEmbeddingProvider } from '@/services/llm/bridgeEmbeddingProvider'
import { createDesktopSearchDeps, semanticSearch } from '@/services/search/semanticSearch'
import { loadCachedProviderSettings } from '@/services/settings/providerSettingsCache'
import type { SearchResult } from '@/types/search'

type SearchState = {
  /** Last submitted query, preserved across navigation. */
  query: string
  results: SearchResult[]
  loading: boolean
  error: string | null
  /** True once at least one search ran (distinguishes empty vs no-results). */
  searched: boolean
  /** Number of indexed embeddings; null until checked. */
  embeddingCount: number | null
}

const state = reactive<SearchState>({
  query: '',
  results: [],
  loading: false,
  error: null,
  searched: false,
  embeddingCount: null,
})

async function refreshIndexStatus(): Promise<void> {
  if (!window.meshNest) {
    state.embeddingCount = 0
    return
  }
  try {
    state.embeddingCount = await window.meshNest.countEmbeddings()
  } catch {
    state.embeddingCount = null
  }
}

function patchResultPaths(
  modelFileId: string,
  patch: Partial<Pick<SearchResult, 'absolutePath' | 'filename'>>,
): void {
  state.results = state.results.map((result) =>
    result.modelFileId === modelFileId ? { ...result, ...patch } : result,
  )
}

export function formatSearchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (
    message.includes('dlopen') ||
    message.includes('onnxruntime') ||
    message.includes('to_chars') ||
    message.includes('libc++')
  ) {
    return 'Embedding provider unavailable — configure Ollama or an API provider in Settings.'
  }
  return message
}

async function runSearch(query: string): Promise<void> {
  state.query = query
  if (query.trim().length === 0) {
    state.results = []
    state.searched = false
    state.error = null
    return
  }
  if (!window.meshNest) {
    state.error = 'Search is only available in the desktop app.'
    return
  }

  state.loading = true
  state.error = null
  try {
    const rawSettings = loadCachedProviderSettings()?.embedding
    const isBuiltin = !rawSettings || rawSettings.provider === 'builtin'
    if (
      isBuiltin &&
      typeof window.meshNest.isBuiltinEmbeddingAvailable === 'function' &&
      !(await window.meshNest.isBuiltinEmbeddingAvailable())
    ) {
      state.results = []
      state.searched = true
      state.error =
        'Embedding provider unavailable — configure Ollama or an API provider in Settings.'
      return
    }

    const provider = await createBridgeEmbeddingProvider(rawSettings)
    if (provider.name === 'none') {
      state.results = []
      state.searched = true
      state.error =
        'Embedding provider unavailable — configure Ollama or an API provider in Settings.'
      return
    }

    state.results = await semanticSearch(
      query,
      createDesktopSearchDeps(provider),
    )
    state.searched = true
  } catch (error) {
    state.results = []
    state.searched = true
    state.error = formatSearchError(error)
  } finally {
    state.loading = false
  }
}

/** Test-only helper to restore a pristine store between specs. */
export function resetSearchStore(): void {
  state.query = ''
  state.results = []
  state.loading = false
  state.error = null
  state.searched = false
  state.embeddingCount = null
}

/**
 * Shared search state (module singleton): preserves the last query and
 * results when the user navigates away and back.
 */
export function useSearchStore() {
  return {
    state: readonly(state),
    runSearch,
    refreshIndexStatus,
    patchResultPaths,
  }
}
