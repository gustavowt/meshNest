import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { DuckDbClient } from '@/services/database/duckdbClient'
import { runMigrations } from '@/services/database/migrations'
import {
  loadStoredProviderSettings,
  SettingsRepository,
  storeProviderSettings,
} from '@/services/database/settingsRepository'
import {
  DEFAULT_PROVIDER_SETTINGS,
  defaultEmbeddingSettings,
  defaultVisionSettings,
  validateProviderSettings,
} from '@/services/settings/providerSettings'
import {
  testEmbeddingConnection,
  testVisionConnection,
} from '@/services/settings/providerTester'
import type { ProviderSettings } from '@/types/providerSettings'

let client: DuckDbClient

beforeEach(async () => {
  client = await DuckDbClient.open(':memory:')
  await runMigrations(client)
})

afterEach(async () => {
  await client.close()
})

function validSettings(): ProviderSettings {
  return JSON.parse(JSON.stringify(DEFAULT_PROVIDER_SETTINGS))
}

describe('provider settings defaults', () => {
  test('defaults to mock vision and the built-in local embedding model', () => {
    expect(DEFAULT_PROVIDER_SETTINGS.vision.provider).toBe('mock')
    expect(DEFAULT_PROVIDER_SETTINGS.embedding.provider).toBe('builtin')
    expect(DEFAULT_PROVIDER_SETTINGS.embedding.model).toBe('Xenova/all-MiniLM-L6-v2')
    expect(DEFAULT_PROVIDER_SETTINGS.embedding.dimensions).toBe(384)
  })

  test('switching providers fills in that provider defaults', () => {
    const openai = defaultVisionSettings('openai')
    expect(openai.model).toBe('gpt-4o-mini')

    const ollama = defaultEmbeddingSettings('ollama')
    expect(ollama.baseUrl).toBe('http://localhost:11434')
    expect(ollama.dimensions).toBe(768)
  })
})

describe('validateProviderSettings', () => {
  test('accepts the defaults', () => {
    expect(validateProviderSettings(validSettings())).toEqual([])
  })

  test('requires an API key for key-based providers', () => {
    const settings = validSettings()
    settings.vision = defaultVisionSettings('openai')

    const problems = validateProviderSettings(settings)
    expect(problems.some((p) => p.includes('API key'))).toBe(true)
  })

  test('requires a base URL for Ollama', () => {
    const settings = validSettings()
    settings.embedding = { ...defaultEmbeddingSettings('ollama'), baseUrl: '' }

    const problems = validateProviderSettings(settings)
    expect(problems.some((p) => p.includes('base URL'))).toBe(true)
  })

  test('rejects missing model names and bad dimensions', () => {
    const settings = validSettings()
    settings.vision.model = '  '
    settings.embedding.dimensions = -5

    const problems = validateProviderSettings(settings)
    expect(problems.some((p) => p.includes('Vision model'))).toBe(true)
    expect(problems.some((p) => p.includes('dimensions'))).toBe(true)
  })
})

describe('settings persistence', () => {
  test('stores and reloads provider settings as JSON', async () => {
    const repository = new SettingsRepository(client)
    const settings = validSettings()
    settings.vision = { ...defaultVisionSettings('openai'), apiKey: 'sk-test' }

    await storeProviderSettings(repository, settings)
    const reloaded = await loadStoredProviderSettings<ProviderSettings>(repository)

    expect(reloaded?.vision.provider).toBe('openai')
    expect(reloaded?.vision.apiKey).toBe('sk-test')
    expect(reloaded?.embedding.provider).toBe('builtin')
  })

  test('overwrites previous settings on save', async () => {
    const repository = new SettingsRepository(client)
    await storeProviderSettings(repository, validSettings())

    const updated = validSettings()
    updated.embedding = { ...defaultEmbeddingSettings('openai'), apiKey: 'sk-2' }
    await storeProviderSettings(repository, updated)

    const reloaded = await loadStoredProviderSettings<ProviderSettings>(repository)
    expect(reloaded?.embedding.provider).toBe('openai')
  })

  test('returns undefined when nothing is stored', async () => {
    const repository = new SettingsRepository(client)
    expect(await loadStoredProviderSettings(repository)).toBeUndefined()
  })
})

describe('provider connection tests', () => {
  const okFetch = (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch
  const unauthorizedFetch = (async () => ({ ok: false, status: 401 })) as unknown as typeof fetch
  const downFetch = (async () => {
    throw new Error('ECONNREFUSED')
  }) as unknown as typeof fetch

  test('mock and builtin providers always pass without network access', async () => {
    expect((await testVisionConnection({ provider: 'mock', model: 'm' }, downFetch)).ok).toBe(true)
    expect(
      (
        await testEmbeddingConnection(
          { provider: 'builtin', model: 'm', dimensions: 384 },
          downFetch,
        )
      ).ok,
    ).toBe(true)
  })

  test('reports success for reachable providers', async () => {
    const result = await testVisionConnection(
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk' },
      okFetch,
    )
    expect(result.ok).toBe(true)
  })

  test('reports authentication failures clearly', async () => {
    const result = await testVisionConnection(
      { provider: 'gemini', model: 'gemini-2.0-flash', apiKey: 'bad' },
      unauthorizedFetch,
    )
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Authentication failed')
  })

  test('reports unreachable providers clearly', async () => {
    const result = await testEmbeddingConnection(
      {
        provider: 'ollama',
        model: 'nomic-embed-text',
        baseUrl: 'http://localhost:11434',
        dimensions: 768,
      },
      downFetch,
    )
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Could not reach')
  })
})
