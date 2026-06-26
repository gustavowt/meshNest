import { reactive, readonly } from 'vue'
import type { DeepReadonly } from 'vue'
import type { ImageSearchQuery, WorldSearchProviderId, WorldSearchResult } from '@/types/worldSearch'

type WorldSearchState = {
  query: string
  results: WorldSearchResult[]
  providerErrors: Array<{ providerId: WorldSearchProviderId; message: string }>
  loading: boolean
  analyzingImage: boolean
  error: string | null
  searched: boolean
  imagePreviewUrl: string | null
  imageDerivedQuery: ImageSearchQuery | null
}

const state = reactive<WorldSearchState>({
  query: '',
  results: [],
  providerErrors: [],
  loading: false,
  analyzingImage: false,
  error: null,
  searched: false,
  imagePreviewUrl: null,
  imageDerivedQuery: null,
})

function revokeImagePreview(): void {
  if (state.imagePreviewUrl) {
    URL.revokeObjectURL(state.imagePreviewUrl)
    state.imagePreviewUrl = null
  }
}

async function runSearch(query: string): Promise<void> {
  state.query = query
  if (query.trim().length === 0) {
    state.results = []
    state.providerErrors = []
    state.searched = false
    state.error = null
    return
  }
  if (!window.meshNest) {
    state.error = 'World search is only available in the desktop app.'
    return
  }

  state.loading = true
  state.error = null
  try {
    const response = await window.meshNest.worldSearch({ query })
    state.results = response.results
    state.providerErrors = response.providerErrors
    state.searched = true
  } catch (error) {
    state.results = []
    state.providerErrors = []
    state.searched = true
    state.error = error instanceof Error ? error.message : String(error)
  } finally {
    state.loading = false
  }
}

async function searchFromImage(file: File): Promise<void> {
  if (!window.meshNest) {
    state.error = 'World search is only available in the desktop app.'
    return
  }

  revokeImagePreview()
  state.imagePreviewUrl = URL.createObjectURL(file)
  state.analyzingImage = true
  state.error = null
  state.imageDerivedQuery = null

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const base64 = uint8ToBase64(bytes)
    const derived = await window.meshNest.describeImageWorldSearchQuery(base64)
    state.imageDerivedQuery = derived
    await runSearch(derived.query)
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
  } finally {
    state.analyzingImage = false
  }
}

async function openResult(result: DeepReadonly<WorldSearchResult>): Promise<void> {
  if (!window.meshNest) {
    return
  }
  await window.meshNest.openWorldSearchSourceUrl(result.sourceUrl)
}

function clearImageSearch(): void {
  revokeImagePreview()
  state.imageDerivedQuery = null
}

/** Test-only helper to restore a pristine store between specs. */
export function resetWorldSearchStore(): void {
  revokeImagePreview()
  state.query = ''
  state.results = []
  state.providerErrors = []
  state.loading = false
  state.analyzingImage = false
  state.error = null
  state.searched = false
  state.imageDerivedQuery = null
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

export function useWorldSearchStore() {
  return {
    state: readonly(state),
    runSearch,
    searchFromImage,
    openResult,
    clearImageSearch,
  }
}
