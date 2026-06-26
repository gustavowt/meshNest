import { describe, expect, test } from 'vitest'
import {
  MAIN_WORLD_SEARCH_PROVIDER_IDS,
  TOKEN_REQUIRED_WORLD_SEARCH_PROVIDER_IDS,
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

  test('lists Cloudflare-blocked repositories as token-required providers', () => {
    expect(TOKEN_REQUIRED_WORLD_SEARCH_PROVIDER_IDS).toEqual(['thingiverse', 'thangs'])
    expect(WORLD_SEARCH_PROVIDER_IDS).toEqual([
      'sketchfab',
      'printables',
      'makerworld',
      'crealitycloud',
      'thingiverse',
      'thangs',
    ])
    for (const providerId of TOKEN_REQUIRED_WORLD_SEARCH_PROVIDER_IDS) {
      const provider = WORLD_SEARCH_PROVIDERS[providerId]
      expect(provider.needsApiToken, providerId).toBe(true)
      expect(provider.description, providerId).toContain('token')
    }
  })

  test('documents Creality Cloud as a main metadata connector', () => {
    expect(WORLD_SEARCH_PROVIDERS.crealitycloud.linkOnly).toBe(true)
    expect(WORLD_SEARCH_PROVIDERS.crealitycloud.needsApiKey).toBe(false)
  })
})
