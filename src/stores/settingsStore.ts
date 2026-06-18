import { reactive, watch } from 'vue'
import i18n from '@/i18n'
import {
  defaultEmbeddingSettings,
  defaultVisionSettings,
  validateProviderSettings,
} from '@/services/settings/providerSettings'
import type {
  EmbeddingProviderId,
  ProviderSettings,
  ProviderTestResult,
  VisionProviderId,
} from '@/types/providerSettings'

type SettingsState = {
  /** Editable draft shown in the form. */
  draft: ProviderSettings | null
  loading: boolean
  saving: boolean
  /** Validation problems from the last save attempt. */
  problems: string[]
  error: string | null
  /** True briefly after a successful save. */
  saved: boolean
  /** True when the last save cleared embeddings (provider/model change). */
  needsReembed: boolean
  reembedding: boolean
  reembedResult: { embedded: number; failed: number; errorMessage?: string } | null
  visionTest: ProviderTestResult | null
  embeddingTest: ProviderTestResult | null
  testingVision: boolean
  testingEmbedding: boolean
  ollamaVisionModels: string[]
  ollamaEmbeddingModels: string[]
  fetchingOllamaVisionModels: boolean
  fetchingOllamaEmbeddingModels: boolean
  ollamaVisionError: string | null
  ollamaEmbeddingError: string | null
}

const state = reactive<SettingsState>({
  draft: null,
  loading: false,
  saving: false,
  problems: [],
  error: null,
  saved: false,
  needsReembed: false,
  reembedding: false,
  reembedResult: null,
  visionTest: null,
  embeddingTest: null,
  testingVision: false,
  testingEmbedding: false,
  ollamaVisionModels: [],
  ollamaEmbeddingModels: [],
  fetchingOllamaVisionModels: false,
  fetchingOllamaEmbeddingModels: false,
  ollamaVisionError: null,
  ollamaEmbeddingError: null,
})

let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null

export function applyAppearance(appearance: 'clear' | 'dark' | 'system') {
  if (typeof window === 'undefined') return
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

  if (systemThemeListener) {
    mediaQuery.removeEventListener('change', systemThemeListener)
    systemThemeListener = null
  }

  const updateTheme = (isDark: boolean) => {
    document.documentElement.classList.toggle('dark', isDark)
  }

  if (appearance === 'system') {
    updateTheme(mediaQuery.matches)
    systemThemeListener = (e: MediaQueryListEvent) => {
      updateTheme(e.matches)
    }
    mediaQuery.addEventListener('change', systemThemeListener)
  } else {
    updateTheme(appearance === 'dark')
  }
}

// Watch for appearance changes in the draft (live preview)
watch(
  () => state.draft?.appearance,
  (newAppearance) => {
    applyAppearance(newAppearance || 'system')
  }
)

// Watch for language changes in the draft (live preview)
watch(
  () => state.draft?.language,
  (newLanguage) => {
    if (newLanguage) {
      i18n.global.locale.value = newLanguage
    }
  }
)

async function loadSettings(): Promise<void> {
  if (!window.meshNest) {
    state.error = 'Settings are only available in the desktop app.'
    return
  }
  state.loading = true
  state.error = null
  try {
    state.draft = await window.meshNest.getProviderSettings()
    if (state.draft) {
      if (!state.draft.appearance) {
        state.draft.appearance = 'system'
      }
      applyAppearance(state.draft.appearance)
      if (state.draft.language) {
        i18n.global.locale.value = state.draft.language
      } else {
        state.draft.language = 'en'
      }
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
  } finally {
    state.loading = false
  }
}

function switchVisionProvider(provider: VisionProviderId): void {
  if (!state.draft) return
  const previousKey = state.draft.vision.apiKey
  state.draft.vision = { ...defaultVisionSettings(provider), apiKey: previousKey }
  state.visionTest = null
  state.saved = false
}

function switchEmbeddingProvider(provider: EmbeddingProviderId): void {
  if (!state.draft) return
  const previousKey = state.draft.embedding.apiKey
  state.draft.embedding = { ...defaultEmbeddingSettings(provider), apiKey: previousKey }
  state.embeddingTest = null
  state.saved = false
}

async function saveSettings(): Promise<boolean> {
  if (!window.meshNest || !state.draft) {
    return false
  }
  state.problems = validateProviderSettings(state.draft)
  if (state.problems.length > 0) {
    return false
  }
  state.saving = true
  state.error = null
  try {
    const outcome = await window.meshNest.saveProviderSettings(
      JSON.parse(JSON.stringify(state.draft)),
    )
    state.saved = true
    if (outcome.embeddingsCleared) {
      state.needsReembed = true
      state.reembedResult = null
    }
    return true
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
    return false
  } finally {
    state.saving = false
  }
}

async function reembedLibrary(): Promise<void> {
  if (!window.meshNest || state.reembedding) return
  state.reembedding = true
  state.reembedResult = null
  try {
    state.reembedResult = await window.meshNest.reembedAll()
    if (state.reembedResult.failed === 0) {
      state.needsReembed = false
    }
  } catch (error) {
    state.reembedResult = {
      embedded: 0,
      failed: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    }
  } finally {
    state.reembedding = false
  }
}

async function testVision(): Promise<void> {
  if (!window.meshNest || !state.draft) return
  state.testingVision = true
  state.visionTest = null
  try {
    state.visionTest = await window.meshNest.testVisionProvider(
      JSON.parse(JSON.stringify(state.draft.vision)),
    )
  } catch (error) {
    state.visionTest = {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  } finally {
    state.testingVision = false
  }
}

async function testEmbedding(): Promise<void> {
  if (!window.meshNest || !state.draft) return
  state.testingEmbedding = true
  state.embeddingTest = null
  try {
    state.embeddingTest = await window.meshNest.testEmbeddingProvider(
      JSON.parse(JSON.stringify(state.draft.embedding)),
    )
  } catch (error) {
    state.embeddingTest = {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  } finally {
    state.testingEmbedding = false
  }
}

async function fetchOllamaVisionModels(baseUrl: string): Promise<void> {
  if (!window.meshNest) return
  state.fetchingOllamaVisionModels = true
  state.ollamaVisionError = null
  try {
    state.ollamaVisionModels = await window.meshNest.getOllamaModels(baseUrl)
  } catch (error) {
    state.ollamaVisionError = error instanceof Error ? error.message : String(error)
  } finally {
    state.fetchingOllamaVisionModels = false
  }
}

async function fetchOllamaEmbeddingModels(baseUrl: string): Promise<void> {
  if (!window.meshNest) return
  state.fetchingOllamaEmbeddingModels = true
  state.ollamaEmbeddingError = null
  try {
    state.ollamaEmbeddingModels = await window.meshNest.getOllamaModels(baseUrl)
  } catch (error) {
    state.ollamaEmbeddingError = error instanceof Error ? error.message : String(error)
  } finally {
    state.fetchingOllamaEmbeddingModels = false
  }
}

function markDirty(): void {
  state.saved = false
}

/** Test-only helper to restore a pristine store between specs. */
export function resetSettingsStore(): void {
  state.draft = null
  state.loading = false
  state.saving = false
  state.problems = []
  state.error = null
  state.saved = false
  state.needsReembed = false
  state.reembedding = false
  state.reembedResult = null
  state.visionTest = null
  state.embeddingTest = null
  state.testingVision = false
  state.testingEmbedding = false
  state.ollamaVisionModels = []
  state.ollamaEmbeddingModels = []
  state.fetchingOllamaVisionModels = false
  state.fetchingOllamaEmbeddingModels = false
  state.ollamaVisionError = null
  state.ollamaEmbeddingError = null
}

/**
 * Shared provider settings state (module singleton). The page edits the
 * draft through v-model and explicitly saves; provider switches reset
 * model/baseUrl to that provider's defaults while keeping the API key.
 * State is intentionally not wrapped in readonly: the draft is a form.
 */
export function useSettingsStore() {
  return {
    state,
    loadSettings,
    saveSettings,
    reembedLibrary,
    switchVisionProvider,
    switchEmbeddingProvider,
    testVision,
    testEmbedding,
    markDirty,
    fetchOllamaVisionModels,
    fetchOllamaEmbeddingModels,
  }
}
