import {
  DEFAULT_PROVIDER_SETTINGS,
  validateProviderSettings,
} from '../../../src/services/settings/providerSettings'
import {
  loadStoredProviderSettings,
  SettingsRepository,
  storeProviderSettings,
} from '../../../src/services/database/settingsRepository'
import { clearEmbeddings, ensureEmbeddingTable } from '../../../src/services/database/embeddingTable'
import type { DuckDbClient } from '../../../src/services/database/duckdbClient'
import type { EmbeddingSettings, ProviderSettings } from '../../../src/types/providerSettings'
import { getDatabaseClient } from './database'

/**
 * Loads provider settings from an already-open client, falling back to
 * defaults (mock vision + built-in local embeddings) when nothing is
 * saved yet. Used during database startup, before getDatabaseClient()
 * has resolved.
 */
export async function resolveProviderSettings(client: DuckDbClient): Promise<ProviderSettings> {
  const repository = new SettingsRepository(client)
  const stored = await loadStoredProviderSettings<ProviderSettings>(repository)
  if (!stored) {
    return DEFAULT_PROVIDER_SETTINGS
  }
  return {
    vision: { ...DEFAULT_PROVIDER_SETTINGS.vision, ...stored.vision },
    embedding: { ...DEFAULT_PROVIDER_SETTINGS.embedding, ...stored.embedding },
    libraryFolder: stored.libraryFolder ?? DEFAULT_PROVIDER_SETTINGS.libraryFolder,
    appearance: stored.appearance ?? DEFAULT_PROVIDER_SETTINGS.appearance,
    language: stored.language ?? DEFAULT_PROVIDER_SETTINGS.language,
    defaultSlicer: stored.defaultSlicer ?? DEFAULT_PROVIDER_SETTINGS.defaultSlicer,
  }
}

export async function getProviderSettings(): Promise<ProviderSettings> {
  return resolveProviderSettings(await getDatabaseClient())
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
  const problems = validateProviderSettings(settings)
  if (problems.length > 0) {
    throw new Error(`Invalid provider settings: ${problems.join(' ')}`)
  }

  const client = await getDatabaseClient()
  const previous = await resolveProviderSettings(client)
  await storeProviderSettings(new SettingsRepository(client), settings)

  if (!embeddingConfigChanged(previous.embedding, settings.embedding)) {
    return { embeddingsCleared: false }
  }

  // The vector space changed: resize the table if needed and drop all
  // stored embeddings so stale vectors can never pollute search results.
  const { rebuilt } = await ensureEmbeddingTable(client, settings.embedding.dimensions)
  if (!rebuilt) {
    await clearEmbeddings(client)
  }
  return { embeddingsCleared: true }
}
