import {
  DEFAULT_PROVIDER_SETTINGS,
  validateProviderSettings,
} from '../../../src/services/settings/providerSettings'
import {
  loadStoredProviderSettings,
  SettingsRepository,
  storeProviderSettings,
} from '../../../src/services/database/settingsRepository'
import type { ProviderSettings } from '../../../src/types/providerSettings'
import { getDatabaseClient } from './database'

/**
 * Loads provider settings from the database, falling back to defaults
 * (mock vision + built-in local embeddings) when nothing is saved yet.
 */
export async function getProviderSettings(): Promise<ProviderSettings> {
  const repository = new SettingsRepository(await getDatabaseClient())
  const stored = await loadStoredProviderSettings<ProviderSettings>(repository)
  if (!stored) {
    return DEFAULT_PROVIDER_SETTINGS
  }
  return {
    vision: { ...DEFAULT_PROVIDER_SETTINGS.vision, ...stored.vision },
    embedding: { ...DEFAULT_PROVIDER_SETTINGS.embedding, ...stored.embedding },
  }
}

export async function saveProviderSettings(settings: ProviderSettings): Promise<void> {
  const problems = validateProviderSettings(settings)
  if (problems.length > 0) {
    throw new Error(`Invalid provider settings: ${problems.join(' ')}`)
  }
  const repository = new SettingsRepository(await getDatabaseClient())
  await storeProviderSettings(repository, settings)
}
