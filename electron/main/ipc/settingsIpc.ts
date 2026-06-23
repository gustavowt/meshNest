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

  ipcMain.handle('settings:testVisionProvider', async (_event, settings: VisionSettings) => {
    return testVisionConnection(settings)
  })

  ipcMain.handle('settings:testEmbeddingProvider', async (_event, settings: EmbeddingSettings) => {
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
