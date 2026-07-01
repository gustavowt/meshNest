import { WORLD_SEARCH_PROVIDER_IDS } from '@/services/world-search/providerMetadata'
import type { WorldSearchProviderId, WorldSearchSettings } from '@/types/worldSearch'

function providerDefaults(
  enabled: boolean,
): WorldSearchSettings['providers'][WorldSearchProviderId] {
  return { enabled, credentials: {} }
}

/** Default world-search configuration: all supported providers enabled. */
export const DEFAULT_WORLD_SEARCH_SETTINGS: WorldSearchSettings = {
  limitPerProvider: 12,
  imageResearch: {
    enabled: false,
    provider: 'googleCloudVision',
    credentials: {},
  },
  providers: {
    sketchfab: providerDefaults(true),
    printables: providerDefaults(true),
    makerworld: providerDefaults(true),
    crealitycloud: providerDefaults(true),
  },
}

export function mergeWorldSearchSettings(
  stored: Partial<WorldSearchSettings> | undefined,
): WorldSearchSettings {
  const base = DEFAULT_WORLD_SEARCH_SETTINGS
  if (!stored) {
    return JSON.parse(JSON.stringify(base))
  }

  const mergedProviders = { ...base.providers }
  for (const id of WORLD_SEARCH_PROVIDER_IDS) {
    const storedProvider = stored.providers?.[id]
    if (!storedProvider) {
      continue
    }
    mergedProviders[id] = {
      enabled: storedProvider.enabled ?? base.providers[id].enabled,
      credentials: {
        ...base.providers[id].credentials,
        ...storedProvider.credentials,
      },
    }
  }

  const limit =
    typeof stored.limitPerProvider === 'number' && stored.limitPerProvider > 0
      ? Math.min(stored.limitPerProvider, 24)
      : base.limitPerProvider

  const imageResearch = {
    ...base.imageResearch,
    ...stored.imageResearch,
    credentials: {
      ...base.imageResearch.credentials,
      ...stored.imageResearch?.credentials,
    },
  }

  return { limitPerProvider: limit, providers: mergedProviders, imageResearch }
}

export function validateWorldSearchSettings(settings: WorldSearchSettings): string[] {
  const problems: string[] = []

  if (!Number.isInteger(settings.limitPerProvider) || settings.limitPerProvider <= 0) {
    problems.push('World search limit per provider must be a positive integer.')
  }

  if (settings.imageResearch.enabled && !settings.imageResearch.credentials.apiKey?.trim()) {
    problems.push('Google Cloud Vision requires an API key when image research is enabled.')
  }

  return problems
}
