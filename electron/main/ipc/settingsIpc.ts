import { ipcMain } from 'electron'
import {
  testEmbeddingConnection,
  testVisionConnection,
} from '../../../src/services/settings/providerTester'
import type {
  EmbeddingSettings,
  ProviderSettings,
  VisionSettings,
} from '../../../src/types/providerSettings'
import {
  getBuiltinEmbeddingProbeResult,
  isBuiltinEmbeddingAvailable,
} from '../services/builtinEmbedding'
import { getProviderSettings, saveProviderSettings, syncProviderSettings } from '../services/providerSettings'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:getProviderSettings', async () => {
    return getProviderSettings()
  })

  ipcMain.handle('settings:saveProviderSettings', async (_event, settings: ProviderSettings) => {
    return saveProviderSettings(settings)
  })

  ipcMain.handle('settings:syncProviderSettings', async (_event, settings: ProviderSettings) => {
    syncProviderSettings(settings)
  })

  ipcMain.handle('settings:isBuiltinEmbeddingAvailable', async () => {
    return isBuiltinEmbeddingAvailable()
  })

  ipcMain.handle('settings:testBuiltinEmbedding', async () => {
    const probe = getBuiltinEmbeddingProbeResult()
    return {
      ok: probe.available,
      reason: probe.reason,
    }
  })

  ipcMain.handle('settings:testVisionProvider', async (_event, settings: VisionSettings) => {
    return testVisionConnection(settings)
  })

  ipcMain.handle('settings:testEmbeddingProvider', async (_event, settings: EmbeddingSettings) => {
    if (settings.provider === 'builtin') {
      const probe = getBuiltinEmbeddingProbeResult()
      if (!probe.available) {
        return {
          ok: false,
          message:
            'Built-in embedding cannot load on this macOS version (requires macOS 13.3+). Choose Ollama or an API provider instead.',
        }
      }
    }
    return testEmbeddingConnection(settings)
  })

  ipcMain.handle('settings:getOllamaModels', async (_event, baseUrl: string) => {
    try {
      const url = `${baseUrl.replace(/\/$/, '')}/api/tags`
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`Failed to fetch Ollama models: HTTP ${res.status}`)
      }
      const data = (await res.json()) as { models?: { name: string }[] }
      return (data.models || []).map((m) => m.name)
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error))
    }
  })
}
