import { describe, expect, test } from 'vitest'
import {
  DEFAULT_PROVIDER_SETTINGS,
  defaultEmbeddingSettings,
  defaultVisionSettings,
  isRealVisionProviderId,
  validateProviderSettings,
} from '@/services/settings/providerSettings'
import {
  testEmbeddingConnection,
  testVisionConnection,
} from '@/services/settings/providerTester'
import type { ProviderSettings } from '@/types/providerSettings'

function validSettings(): ProviderSettings {
  return JSON.parse(JSON.stringify(DEFAULT_PROVIDER_SETTINGS))
}

describe('provider settings defaults', () => {
  test('defaults to no vision provider and the built-in local embedding model', () => {
    expect(DEFAULT_PROVIDER_SETTINGS.vision.provider).toBe('none')
    expect(DEFAULT_PROVIDER_SETTINGS.vision.model).toBe('')
    expect(DEFAULT_PROVIDER_SETTINGS.embedding.provider).toBe('builtin')
    expect(DEFAULT_PROVIDER_SETTINGS.embedding.model).toBe('Xenova/paraphrase-multilingual-MiniLM-L12-v2')
    expect(DEFAULT_PROVIDER_SETTINGS.embedding.dimensions).toBe(384)
  })

  test('switching providers fills in that provider defaults', () => {
    const openai = defaultVisionSettings('openai')
    expect(openai.model).toBe('gpt-4o-mini')

    const ollama = defaultEmbeddingSettings('ollama')
    expect(ollama.baseUrl).toBe('http://localhost:11434')
    expect(ollama.dimensions).toBe(768)
  })

  test('defaults to embedding useCloud: false and empty libraryFolder', () => {
    expect(DEFAULT_PROVIDER_SETTINGS.embedding.useCloud).toBe(false)
    expect(DEFAULT_PROVIDER_SETTINGS.libraryFolder).toBe('')
  })

  test('recognizes only real vision providers as image-search capable', () => {
    expect(isRealVisionProviderId('none')).toBe(false)
    expect(isRealVisionProviderId('mock')).toBe(false)
    expect(isRealVisionProviderId('openai')).toBe(true)
    expect(isRealVisionProviderId('gemini')).toBe(true)
    expect(isRealVisionProviderId('ollama')).toBe(true)
  })
})

describe('validateProviderSettings', () => {
  test('accepts the defaults', () => {
    expect(validateProviderSettings(validSettings())).toEqual([])
  })

  test('accepts none (disabled) provider for vision and embedding', () => {
    const settings = validSettings()
    settings.vision = defaultVisionSettings('none')
    settings.embedding = defaultEmbeddingSettings('none')

    const problems = validateProviderSettings(settings)
    expect(problems).toEqual([])
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
    settings.vision = { ...defaultVisionSettings('openai'), apiKey: 'sk-test' }
    settings.vision.model = '  '
    settings.embedding.dimensions = -5

    const problems = validateProviderSettings(settings)
    expect(problems.some((p) => p.includes('Vision model'))).toBe(true)
    expect(problems.some((p) => p.includes('dimensions'))).toBe(true)
  })

})

describe('provider connection tests', () => {
  const downFetch = (async () => {
    throw new Error('ECONNREFUSED')
  }) as unknown as typeof fetch

  const openaiOkFetch = (async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({ choices: [{ message: { content: 'Connection Test' } }] }),
  })) as unknown as typeof fetch

  const unauthorizedPostFetch = (async () => ({
    ok: false,
    status: 401,
    text: async () => 'Unauthorized',
  })) as unknown as typeof fetch

  test('mock, none and builtin providers always pass without network access', async () => {
    expect((await testVisionConnection({ provider: 'mock', model: 'm' }, downFetch)).ok).toBe(true)
    expect((await testVisionConnection({ provider: 'none', model: '' }, downFetch)).ok).toBe(true)
    expect(
      (
        await testEmbeddingConnection(
          { provider: 'builtin', model: 'm', dimensions: 384 },
          downFetch,
        )
      ).ok,
    ).toBe(true)
    expect(
      (
        await testEmbeddingConnection(
          { provider: 'none', model: '', dimensions: 0 },
          downFetch,
        )
      ).ok,
    ).toBe(true)
  })

  test('reports success when the vision model returns a response', async () => {
    const result = await testVisionConnection(
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk' },
      openaiOkFetch,
    )
    expect(result.ok).toBe(true)
    expect(result.message).toContain('responded successfully')
  })

  test('reports authentication failures clearly', async () => {
    const result = await testVisionConnection(
      { provider: 'gemini', model: 'gemini-2.0-flash', apiKey: 'bad' },
      unauthorizedPostFetch,
    )
    expect(result.ok).toBe(false)
    expect(result.message).toContain('API key')
  })

  test('reports unreachable providers clearly', async () => {
    const result = await testVisionConnection(
      { provider: 'ollama', model: 'llava', baseUrl: 'http://localhost:11434' },
      downFetch,
    )
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Could not reach')
  })

  test('reports unreachable embedding providers clearly', async () => {
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
