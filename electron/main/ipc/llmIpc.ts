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
import { getProviderSettings, resolveEffectiveEmbeddingSettings } from '../services/providerSettings'

/**
 * LLM calls run in the main process so API keys never reach the
 * renderer and remote requests are not subject to renderer CORS. The
 * built-in local embedding model also needs Node and runs here.
 */
export function registerLlmIpc(): void {
  ipcMain.handle(
    'llm:describeModel',
    async (_event, input: VisionAnalysisInput, settingsSnapshot?: VisionSettings) => {
      const providerSettings = await getProviderSettings()
      const settings = settingsSnapshot ?? providerSettings.vision
      const provider = createVisionProvider(settings)
      // Ask the model to answer in the language the user picked in Settings,
      // which the main process keeps authoritative for every (re)index call.
      return provider.describeModel({ ...input, language: providerSettings.language })
    },
  )

  ipcMain.handle('llm:getActiveVisionProvider', async () => {
    const settings = await getProviderSettings()
    return { name: settings.vision.provider, model: settings.vision.model }
  })

  ipcMain.handle('llm:normalizeName', async (_event, rawName: string, context?: string, settingsSnapshot?: VisionSettings) => {
    const settings = settingsSnapshot ?? (await getProviderSettings()).vision
    if (settings.provider === 'none' || settings.provider === 'mock') {
      throw new Error('A vision AI provider must be enabled to rename with AI.')
    }
    const provider = createVisionProvider(settings)
    return provider.normalizeName(rawName, context)
  })

  ipcMain.handle('llm:normalizeNames', async (_event, items: NameNormalizationInput[], settingsSnapshot?: VisionSettings) => {
    const settings = settingsSnapshot ?? (await getProviderSettings()).vision
    if (settings.provider === 'none' || settings.provider === 'mock') {
      throw new Error('A vision AI provider must be enabled to rename with AI.')
    }
    const provider = createVisionProvider(settings)
    return provider.normalizeNames(items)
  })

  ipcMain.handle(
    'llm:embedText',
    async (_event, text: string, settingsSnapshot?: EmbeddingSettings) => {
      const effectiveSettings = resolveEffectiveEmbeddingSettings(
        settingsSnapshot ?? (await getProviderSettings()).embedding,
      )
      const provider = createEmbeddingProvider(effectiveSettings, {
        builtinFactory: (embedding) =>
          new BuiltinEmbeddingProvider(embedding.model, embedding.dimensions),
      })
      return provider.embedText(text)
    },
  )

  ipcMain.handle('llm:getActiveEmbeddingProvider', async () => {
    const settings = await getProviderSettings()
    const effective = resolveEffectiveEmbeddingSettings(settings.embedding)
    return {
      name: effective.provider,
      model: effective.model,
      dimensions: effective.dimensions,
    }
  })

  ipcMain.handle('llm:reembedAll', async () => {
    return reembedAllModels()
  })
}
