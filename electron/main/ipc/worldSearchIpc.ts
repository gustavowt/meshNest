import { ipcMain, shell } from 'electron'
import { mergeWorldSearchSettings } from '../../../src/services/settings/worldSearchSettings'
import type { WorldSearchQuery } from '../../../src/types/worldSearch'
import { aggregateWorldSearch } from '../services/world-search/aggregator'
import { describeImageQuery } from '../services/world-search/imageQueryService'
import { getProviderSettings } from '../services/providerSettings'

export function registerWorldSearchIpc(): void {
  ipcMain.handle('world-search:search', async (_event, query: WorldSearchQuery) => {
    const settings = getProviderSettings()
    const worldSearch = mergeWorldSearchSettings(settings.worldSearch)
    return aggregateWorldSearch(worldSearch, query)
  })

  ipcMain.handle('world-search:describeImageQuery', async (_event, imageBase64Png: string) => {
    const settings = getProviderSettings()
    if (settings.vision.provider === 'none' || settings.vision.provider === 'mock') {
      throw new Error('Enable a real Vision AI provider in Settings to search by image.')
    }
    const worldSearch = mergeWorldSearchSettings(settings.worldSearch)
    return describeImageQuery(imageBase64Png, settings.vision, settings.language, worldSearch)
  })

  ipcMain.handle('world-search:openSourceUrl', async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('Invalid source URL.')
    }
    await shell.openExternal(url)
  })
}
