import { reactive } from 'vue'
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
  visionTest: ProviderTestResult | null
  embeddingTest: ProviderTestResult | null
  testingVision: boolean
  testingEmbedding: boolean
}

const state = reactive<SettingsState>({
  draft: null,
  loading: false,
  saving: false,
  problems: [],
  error: null,
  saved: false,
  visionTest: null,
  embeddingTest: null,
  testingVision: false,
  testingEmbedding: false,
})

async function loadSettings(): Promise<void> {
  if (!window.meshNest) {
    state.error = 'Settings are only available in the desktop app.'
    return
  }
  state.loading = true
  state.error = null
  try {
    state.draft = await window.meshNest.getProviderSettings()
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
    await window.meshNest.saveProviderSettings(JSON.parse(JSON.stringify(state.draft)))
    state.saved = true
    return true
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
    return false
  } finally {
    state.saving = false
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
  state.visionTest = null
  state.embeddingTest = null
  state.testingVision = false
  state.testingEmbedding = false
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
    switchVisionProvider,
    switchEmbeddingProvider,
    testVision,
    testEmbedding,
    markDirty,
  }
}
