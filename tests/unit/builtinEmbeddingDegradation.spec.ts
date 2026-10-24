import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  isBuiltinEmbeddingAvailable,
  getBuiltinEmbeddingProbeResult,
  setBuiltinEmbeddingAvailableForTests,
} from '../../electron/main/services/builtinEmbedding'
import {
  getActiveEmbeddingProvider,
} from '../../electron/main/services/embeddingService'
import {
  resolveEffectiveEmbeddingSettings,
  resetProviderSettingsFallbackForTests,
} from '../../electron/main/services/providerSettings'
import { createBridgeEmbeddingProvider } from '@/services/llm/bridgeEmbeddingProvider'
import type { MeshNestApi } from '@/types/electronApi'
import type { EmbeddingSettings } from '@/types/providerSettings'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
  },
  ipcMain: {
    handle: vi.fn(),
  },
}))

vi.mock('../../electron/main/services/database', () => ({
  getDatabaseClient: vi.fn(async () => ({})),
}))

describe('builtinEmbedding probe and degradation', () => {
  beforeEach(() => {
    resetProviderSettingsFallbackForTests()
    setBuiltinEmbeddingAvailableForTests(null)
  })

  afterEach(() => {
    resetProviderSettingsFallbackForTests()
    setBuiltinEmbeddingAvailableForTests(null)
    delete (window as { meshNest?: MeshNestApi }).meshNest
    vi.restoreAllMocks()
  })

  test('reports injected availability state and captured reason', () => {
    setBuiltinEmbeddingAvailableForTests(false, 'dlopen symbol missing')
    expect(isBuiltinEmbeddingAvailable()).toBe(false)
    expect(getBuiltinEmbeddingProbeResult()).toEqual({
      available: false,
      reason: 'dlopen symbol missing',
    })

    setBuiltinEmbeddingAvailableForTests(true)
    expect(isBuiltinEmbeddingAvailable()).toBe(true)
    expect(getBuiltinEmbeddingProbeResult()).toEqual({
      available: true,
      reason: undefined,
    })
  })

  test('resolves effective embedding settings to none when builtin is unavailable', () => {
    setBuiltinEmbeddingAvailableForTests(false, 'dlopen symbol not found: to_chars')

    const builtinSettings: EmbeddingSettings = {
      provider: 'builtin',
      model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
      dimensions: 384,
      useCloud: false,
    }

    const effective = resolveEffectiveEmbeddingSettings(builtinSettings)
    expect(effective).toEqual({
      provider: 'none',
      model: '',
      dimensions: 0,
      useCloud: false,
    })
  })

  test('preserves builtin settings when probe reports available', () => {
    setBuiltinEmbeddingAvailableForTests(true)

    const builtinSettings: EmbeddingSettings = {
      provider: 'builtin',
      model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
      dimensions: 384,
      useCloud: false,
    }

    const effective = resolveEffectiveEmbeddingSettings(builtinSettings)
    expect(effective).toEqual(builtinSettings)
  })

  test('does not affect other providers (ollama, openai, mock) when builtin is unavailable', () => {
    setBuiltinEmbeddingAvailableForTests(false, 'dlopen failed')

    const ollama: EmbeddingSettings = {
      provider: 'ollama',
      model: 'nomic-embed-text',
      baseUrl: 'http://localhost:11434',
      dimensions: 768,
      useCloud: false,
    }
    expect(resolveEffectiveEmbeddingSettings(ollama)).toEqual(ollama)

    const mock: EmbeddingSettings = {
      provider: 'mock',
      model: 'mock-model',
      dimensions: 1536,
      useCloud: false,
    }
    expect(resolveEffectiveEmbeddingSettings(mock)).toEqual(mock)
  })

  test('getActiveEmbeddingProvider returns none provider that yields empty vectors without throwing', async () => {
    setBuiltinEmbeddingAvailableForTests(false, 'dlopen failed')

    const provider = await getActiveEmbeddingProvider()
    expect(provider.name).toBe('none')
    expect(provider.dimensions).toBe(0)

    const values = await provider.embedText('any query')
    expect(values).toEqual([])
  })

  test('createBridgeEmbeddingProvider falls back to none when bridge reports builtin is unavailable', async () => {
    window.meshNest = {
      isBuiltinEmbeddingAvailable: async () => false,
    } as unknown as MeshNestApi

    const provider = await createBridgeEmbeddingProvider({
      provider: 'builtin',
      model: 'Xenova/model',
      dimensions: 384,
      useCloud: false,
    })

    expect(provider.name).toBe('none')
    expect(provider.dimensions).toBe(0)
  })

  test('createBridgeEmbeddingProvider keeps builtin when bridge reports builtin is available', async () => {
    window.meshNest = {
      isBuiltinEmbeddingAvailable: async () => true,
    } as unknown as MeshNestApi

    const provider = await createBridgeEmbeddingProvider({
      provider: 'builtin',
      model: 'Xenova/model',
      dimensions: 384,
      useCloud: false,
    })

    expect(provider.name).toBe('builtin')
    expect(provider.dimensions).toBe(384)
  })
})
