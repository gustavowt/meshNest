import {
  DEFAULT_PROVIDER_SETTINGS,
  validateProviderSettings,
} from '../../../src/services/settings/providerSettings'
import { mergeWorldSearchSettings } from '../../../src/services/settings/worldSearchSettings'
import { clearEmbeddings, ensureEmbeddingTable } from '../../../src/services/database/embeddingTable'
import type { EmbeddingSettings, ProviderSettings, VisionSettings } from '../../../src/types/providerSettings'
import { isBuiltinEmbeddingAvailable } from './builtinEmbedding'
import { getDatabaseClient } from './database'

let activeProviderSettings: ProviderSettings = cloneSettings(DEFAULT_PROVIDER_SETTINGS)

function cloneSettings(settings: ProviderSettings): ProviderSettings {
  return JSON.parse(JSON.stringify(settings))
}

function mergeVisionSettings(stored: Partial<VisionSettings> = {}): VisionSettings {
  const merged = { ...DEFAULT_PROVIDER_SETTINGS.vision, ...stored }
  return {
    provider: merged.provider,
    model: merged.model,
    apiKey: merged.apiKey,
    baseUrl: merged.baseUrl,
  }
}

function mergeProviderSettings(stored: Partial<ProviderSettings>): ProviderSettings {
  return {
    vision: mergeVisionSettings(stored.vision),
    embedding: { ...DEFAULT_PROVIDER_SETTINGS.embedding, ...stored.embedding },
    worldSearch: mergeWorldSearchSettings(stored.worldSearch),
    libraryFolder: stored.libraryFolder ?? DEFAULT_PROVIDER_SETTINGS.libraryFolder,
    appearance: stored.appearance ?? DEFAULT_PROVIDER_SETTINGS.appearance,
    language: stored.language ?? DEFAULT_PROVIDER_SETTINGS.language,
  }
}

export function resolveProviderSettings(): ProviderSettings {
  return cloneSettings(activeProviderSettings)
}

export function getProviderSettings(): ProviderSettings {
  return resolveProviderSettings()
}

/**
 * Resolves the effective embedding configuration. When the configured provider
 * is 'builtin' (or defaulted) and the built-in model binding cannot load on this OS,
 * degrades gracefully to 'none'.
 */
export function resolveEffectiveEmbeddingSettings(
  embedding?: EmbeddingSettings,
): EmbeddingSettings {
  const current = embedding ?? activeProviderSettings.embedding
  if (current.provider === 'builtin' && !isBuiltinEmbeddingAvailable()) {
    return {
      provider: 'none',
      model: '',
      dimensions: 0,
      useCloud: false,
    }
  }
  return current
}

export type SaveSettingsOutcome = {
  /**
   * True when the embedding configuration changed: stored embeddings
   * were cleared (different vector space) and the library must be
   * re-embedded before semantic search works again.
   */
  embeddingsCleared: boolean
}

function embeddingConfigChanged(a: EmbeddingSettings, b: EmbeddingSettings): boolean {
  return a.provider !== b.provider || a.model !== b.model || a.dimensions !== b.dimensions
}

export async function saveProviderSettings(
  settings: ProviderSettings,
): Promise<SaveSettingsOutcome> {
  const sanitized = mergeProviderSettings(settings)
  const problems = validateProviderSettings(sanitized)
  if (problems.length > 0) {
    throw new Error(`Invalid provider settings: ${problems.join(' ')}`)
  }

  const previous = resolveProviderSettings()
  activeProviderSettings = cloneSettings(sanitized)

  if (!embeddingConfigChanged(previous.embedding, sanitized.embedding)) {
    return { embeddingsCleared: false }
  }

  // The vector space changed: resize the table if needed and drop all
  // stored embeddings so stale vectors can never pollute search results.
  const client = await getDatabaseClient()
  const { rebuilt } = await ensureEmbeddingTable(client, sanitized.embedding.dimensions)
  if (!rebuilt) {
    await clearEmbeddings(client)
  }
  return { embeddingsCleared: true }
}

export function syncProviderSettings(settings: ProviderSettings): void {
  const sanitized = mergeProviderSettings(settings)
  const problems = validateProviderSettings(sanitized)
  if (problems.length > 0) {
    throw new Error(`Invalid provider settings: ${problems.join(' ')}`)
  }
  activeProviderSettings = cloneSettings(sanitized)
}

/** Test-only helper to avoid leaking main-process fallback state between specs. */
export function resetProviderSettingsFallbackForTests(): void {
  activeProviderSettings = cloneSettings(DEFAULT_PROVIDER_SETTINGS)
}
