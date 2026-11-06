import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { resetSettingsStore, useSettingsStore } from '@/stores/settingsStore'
import { DEFAULT_PROVIDER_SETTINGS } from '@/services/settings/providerSettings'
import {
  clearCachedProviderSettings,
  loadCachedProviderSettings,
  saveCachedProviderSettings,
} from '@/services/settings/providerSettingsCache'
import type { ProviderSettings } from '@/types/providerSettings'

function providerSettings(): ProviderSettings {
  return JSON.parse(JSON.stringify(DEFAULT_PROVIDER_SETTINGS))
}

function installLocalStorageMock(): void {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        values.delete(key)
      }),
    },
  })
}

beforeEach(() => {
  resetSettingsStore()
  installLocalStorageMock()
  clearCachedProviderSettings()
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

afterEach(() => {
  delete (window as any).meshNest
  clearCachedProviderSettings()
  vi.restoreAllMocks()
})

describe('settingsStore', () => {
  test('restores cached settings and rehydrates the desktop bridge on load', async () => {
    const cached = providerSettings()
    cached.vision.model = 'llava:13b'
    cached.libraryFolder = '/models'
    saveCachedProviderSettings(cached)

    window.meshNest = {
      syncProviderSettings: vi.fn(async () => undefined),
      getProviderSettings: vi.fn(),
    } as any

    const store = useSettingsStore()
    await store.loadSettings()

    expect(window.meshNest.syncProviderSettings).toHaveBeenCalledWith(cached)
    expect(window.meshNest.getProviderSettings).not.toHaveBeenCalled()
    expect(store.state.draft?.vision.model).toBe('llava:13b')
    expect(store.state.draft?.libraryFolder).toBe('/models')
    expect(store.state.dirty).toBe(false)
  })

  test('warns when a successful vision test uses unsaved settings', async () => {
    const settings = providerSettings()
    settings.vision.model = 'kimi-k2.7-code:cloude'

    const store = useSettingsStore()
    store.state.draft = settings
    store.markDirty()

    window.meshNest = {
      testVisionProvider: vi.fn(async () => ({
        ok: true,
        message: 'Model responded successfully.',
      })),
    } as any

    await store.testVision()

    expect(window.meshNest.testVisionProvider).toHaveBeenCalledWith(settings.vision)
    expect(store.state.visionTest?.ok).toBe(true)
    expect(store.state.visionTest?.message).toContain('Save settings before scanning')
  })

  test('clears dirty state after saving settings', async () => {
    const settings = providerSettings()
    settings.vision.model = 'kimi-k2.7-code:cloude'

    const store = useSettingsStore()
    store.state.draft = settings
    store.markDirty()

    window.meshNest = {
      saveProviderSettings: vi.fn(async () => ({ embeddingsCleared: false })),
      testVisionProvider: vi.fn(async () => ({
        ok: true,
        message: 'Model responded successfully.',
      })),
    } as any

    await expect(store.saveSettings()).resolves.toBe(true)
    await store.testVision()

    expect(loadCachedProviderSettings()?.vision.model).toBe('kimi-k2.7-code:cloude')
    expect(store.state.dirty).toBe(false)
    expect(store.state.visionTest?.message).toBe('Model responded successfully.')
  })

  test('checks builtin embedding availability when loading settings', async () => {
    window.meshNest = {
      syncProviderSettings: vi.fn(async () => undefined),
      isBuiltinEmbeddingAvailable: vi.fn(async () => false),
    } as any

    const store = useSettingsStore()
    await store.loadSettings()

    expect(window.meshNest.isBuiltinEmbeddingAvailable).toHaveBeenCalled()
    expect(store.state.builtinEmbeddingAvailable).toBe(false)
  })

  test('reports builtin embedding test failure with warning when unavailable', async () => {
    const settings = providerSettings()
    settings.embedding.provider = 'builtin'

    const store = useSettingsStore()
    store.state.draft = settings
    store.state.builtinEmbeddingAvailable = false

    window.meshNest = {
      testEmbeddingProvider: vi.fn(async () => ({
        ok: false,
        message:
          'Built-in embedding cannot load on this macOS version (requires macOS 13.3+). Choose Ollama or an API provider instead.',
      })),
    } as any

    await store.testEmbedding()

    expect(store.state.embeddingTest?.ok).toBe(false)
    expect(store.state.embeddingTest?.message).toContain('requires macOS 13.3+')
  })

  test('reports builtin embedding test failure on non-macOS without mentioning macOS version', async () => {
    const settings = providerSettings()
    settings.embedding.provider = 'builtin'

    const store = useSettingsStore()
    store.state.draft = settings
    store.state.builtinEmbeddingAvailable = false

    window.meshNest = {
      testEmbeddingProvider: vi.fn(async () => ({
        ok: false,
        message:
          'Built-in embedding model is unavailable: failed to load onnxruntime binding. Choose Ollama or an API provider instead.',
      })),
    } as any

    await store.testEmbedding()

    expect(store.state.embeddingTest?.ok).toBe(false)
    expect(store.state.embeddingTest?.message).toContain('Built-in embedding model is unavailable')
    expect(store.state.embeddingTest?.message).not.toContain('macOS')
  })
})
