import { describe, expect, test } from 'vitest'
import {
  MAIN_WORLD_SEARCH_PROVIDER_IDS,
  WORLD_SEARCH_PROVIDER_IDS,
  WORLD_SEARCH_PROVIDERS,
} from '@/services/world-search/providerMetadata'

describe('world search provider metadata', () => {
  test('documents setup instructions for every provider', () => {
    for (const [providerId, provider] of Object.entries(WORLD_SEARCH_PROVIDERS)) {
      expect(provider.setupDocumentation.length, providerId).toBeGreaterThan(0)
      expect(provider.setupDocumentation.every((step) => step.trim().length > 0), providerId).toBe(true)
    }
  })

  test('lists only anonymous-capable model repositories', () => {
    expect(MAIN_WORLD_SEARCH_PROVIDER_IDS).toEqual([
      'sketchfab',
      'printables',
      'makerworld',
      'crealitycloud',
    ])
    for (const providerId of MAIN_WORLD_SEARCH_PROVIDER_IDS) {
      const provider = WORLD_SEARCH_PROVIDERS[providerId]
      expect(provider.needsApiKey, providerId).toBe(false)
      expect(provider.needsUsername, providerId).toBe(false)
      expect(provider.needsOAuth, providerId).toBe(false)
    }
  })

  test('lists only currently supported World Search providers', () => {
    expect(WORLD_SEARCH_PROVIDER_IDS).toEqual([
      'sketchfab',
      'printables',
      'makerworld',
      'crealitycloud',
    ])
    expect(Object.keys(WORLD_SEARCH_PROVIDERS)).toEqual(WORLD_SEARCH_PROVIDER_IDS)
    expect(Object.keys(WORLD_SEARCH_PROVIDERS)).not.toContain('thingiverse')
    expect(Object.keys(WORLD_SEARCH_PROVIDERS)).not.toContain('thangs')
  })

  test('documents Creality Cloud as a main metadata connector', () => {
    expect(WORLD_SEARCH_PROVIDERS.crealitycloud.linkOnly).toBe(true)
    expect(WORLD_SEARCH_PROVIDERS.crealitycloud.needsApiKey).toBe(false)
  })
})
