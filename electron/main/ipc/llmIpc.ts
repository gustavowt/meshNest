import { ipcMain } from 'electron'
import { createEmbeddingProvider } from '../../../src/services/llm/embeddingProviderFactory'
import { createVisionProvider } from '../../../src/services/llm/visionProviderFactory'
import type {
  NameNormalizationInput,
  VisionAnalysisInput,
} from '../../../src/services/llm/visionProvider'
import type { EmbeddingSettings, VisionSettings } from '../../../src/types/providerSettings'
import { BuiltinEmbeddingProvider } from '../services/builtinEmbedding'
import { getActiveEmbeddingProvider, reembedAllModels } from '../services/embeddingService'
import { getProviderSettings } from '../services/providerSettings'

/**
 * LLM calls run in the main process so API keys never reach the
 * renderer and remote requests are not subject to renderer CORS. The
 * built-in local embedding model also needs Node and runs here.
 */
export function registerLlmIpc(): void {
  ipcMain.handle(
    'llm:describeModel',
    async (_event, input: VisionAnalysisInput, settingsSnapshot?: VisionSettings) => {
      const settings = settingsSnapshot ?? (await getProviderSettings()).vision
      const provider = createVisionProvider(settings)
      return provider.describeModel(input)
    },
  )

  ipcMain.handle('llm:getActiveVisionProvider', async () => {
    const settings = await getProviderSettings()
    return { name: settings.vision.provider, model: settings.vision.model }
  })

  ipcMain.handle('llm:normalizeName', async (_event, rawName: string, context?: string) => {
    const settings = await getProviderSettings()
    if (settings.vision.provider === 'none' || settings.vision.provider === 'mock') {
      throw new Error('A vision AI provider must be enabled to rename with AI.')
    }
    const provider = createVisionProvider(settings.vision)
    return provider.normalizeName(rawName, context)
  })

  ipcMain.handle('llm:normalizeNames', async (_event, items: NameNormalizationInput[]) => {
    const settings = await getProviderSettings()
    if (settings.vision.provider === 'none' || settings.vision.provider === 'mock') {
      throw new Error('A vision AI provider must be enabled to rename with AI.')
    }
    const provider = createVisionProvider(settings.vision)
    return provider.normalizeNames(items)
  })

  ipcMain.handle(
    'llm:embedText',
    async (_event, text: string, settingsSnapshot?: EmbeddingSettings) => {
      if (!settingsSnapshot) {
        const provider = await getActiveEmbeddingProvider()
        return provider.embedText(text)
      }

      const provider = createEmbeddingProvider(settingsSnapshot, {
        builtinFactory: (embedding) =>
          new BuiltinEmbeddingProvider(embedding.model, embedding.dimensions),
      })
      return provider.embedText(text)
    },
  )

  ipcMain.handle('llm:getActiveEmbeddingProvider', async () => {
    const settings = await getProviderSettings()
    return {
      name: settings.embedding.provider,
      model: settings.embedding.model,
      dimensions: settings.embedding.dimensions,
    }
  })

  ipcMain.handle('llm:reembedAll', async () => {
    return reembedAllModels()
  })
}
