import { describe, expect, test } from 'vitest'
import {
  DEFAULT_WORLD_SEARCH_SETTINGS,
  mergeWorldSearchSettings,
  validateWorldSearchSettings,
} from '@/services/settings/worldSearchSettings'

describe('worldSearchSettings', () => {
  test('enables main providers and disables token-required providers by default', () => {
    expect(DEFAULT_WORLD_SEARCH_SETTINGS.providers.sketchfab.enabled).toBe(true)
    expect(DEFAULT_WORLD_SEARCH_SETTINGS.providers.printables.enabled).toBe(true)
    expect(DEFAULT_WORLD_SEARCH_SETTINGS.providers.makerworld.enabled).toBe(true)
    expect(DEFAULT_WORLD_SEARCH_SETTINGS.providers.crealitycloud.enabled).toBe(true)
    expect(DEFAULT_WORLD_SEARCH_SETTINGS.providers.thingiverse.enabled).toBe(false)
    expect(DEFAULT_WORLD_SEARCH_SETTINGS.providers.thangs.enabled).toBe(false)
  })

  test('requires API tokens when token-required providers are enabled', () => {
    const settings = JSON.parse(JSON.stringify(DEFAULT_WORLD_SEARCH_SETTINGS))
    settings.providers.thingiverse.enabled = true
    settings.providers.thangs.enabled = true

    const problems = validateWorldSearchSettings(settings)

    expect(problems.some((problem) => problem.includes('Thingiverse'))).toBe(true)
    expect(problems.some((problem) => problem.includes('Thangs'))).toBe(true)
  })

  test('accepts enabled token-required providers when API tokens are present', () => {
    const settings = JSON.parse(JSON.stringify(DEFAULT_WORLD_SEARCH_SETTINGS))
    settings.providers.thingiverse.enabled = true
    settings.providers.thingiverse.credentials.apiToken = 'thingiverse-token'
    settings.providers.thangs.enabled = true
    settings.providers.thangs.credentials.apiToken = 'thangs-token'

    const problems = validateWorldSearchSettings(settings)

    expect(problems.some((problem) => problem.includes('Thingiverse'))).toBe(false)
    expect(problems.some((problem) => problem.includes('Thangs'))).toBe(false)
  })

  test('merges stored provider toggles with defaults', () => {
    const merged = mergeWorldSearchSettings({
      providers: {
        sketchfab: { enabled: false },
        printables: { enabled: true },
      },
    })

    expect(merged.providers.sketchfab.enabled).toBe(false)
    expect(merged.providers.printables.enabled).toBe(true)
    expect(merged.providers.makerworld.enabled).toBe(true)
  })

  test('ignores removed provider keys from older saved settings', () => {
    const merged = mergeWorldSearchSettings({
      providers: {
        myminifactory: { enabled: true, credentials: { apiKey: 'old-key' } },
        cults3d: { enabled: true, credentials: { apiKey: 'old-key', username: 'user' } },
        sketchfab: { enabled: false },
      },
    } as unknown as Partial<typeof DEFAULT_WORLD_SEARCH_SETTINGS>)

    expect(merged.providers.sketchfab.enabled).toBe(false)
    expect(Object.keys(merged.providers)).toEqual([
      'sketchfab',
      'printables',
      'makerworld',
      'crealitycloud',
      'thingiverse',
      'thangs',
    ])
  })

  test('merges optional image web research settings', () => {
    const merged = mergeWorldSearchSettings({
      imageResearch: {
        enabled: true,
        provider: 'googleCloudVision',
        credentials: { apiKey: 'gcv-key' },
      },
    })

    expect(merged.imageResearch.enabled).toBe(true)
    expect(merged.imageResearch.provider).toBe('googleCloudVision')
    expect(merged.imageResearch.credentials.apiKey).toBe('gcv-key')
  })

  test('requires a Google Cloud Vision key when image research is enabled', () => {
    const settings = JSON.parse(JSON.stringify(DEFAULT_WORLD_SEARCH_SETTINGS))
    settings.imageResearch.enabled = true
    const problems = validateWorldSearchSettings(settings)
    expect(problems.some((problem) => problem.includes('Google Cloud Vision'))).toBe(true)
  })
})
