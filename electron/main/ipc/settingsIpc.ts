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
import { getProviderSettings, saveProviderSettings } from '../services/providerSettings'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:getProviderSettings', async () => {
    return getProviderSettings()
  })

  ipcMain.handle('settings:saveProviderSettings', async (_event, settings: ProviderSettings) => {
    return saveProviderSettings(settings)
  })

  ipcMain.handle('settings:testVisionProvider', async (_event, settings: VisionSettings) => {
    return testVisionConnection(settings)
  })

  ipcMain.handle('settings:testEmbeddingProvider', async (_event, settings: EmbeddingSettings) => {
    return testEmbeddingConnection(settings)
  })
}
