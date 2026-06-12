import { ipcMain } from 'electron'
import { createVisionProvider } from '../../../src/services/llm/visionProviderFactory'
import type { VisionAnalysisInput } from '../../../src/services/llm/visionProvider'
import { getActiveEmbeddingProvider, reembedAllModels } from '../services/embeddingService'
import { getProviderSettings } from '../services/providerSettings'

/**
 * LLM calls run in the main process so API keys never reach the
 * renderer and remote requests are not subject to renderer CORS. The
 * built-in local embedding model also needs Node and runs here.
 */
export function registerLlmIpc(): void {
  ipcMain.handle('llm:describeModel', async (_event, input: VisionAnalysisInput) => {
    const settings = await getProviderSettings()
    const provider = createVisionProvider(settings.vision)
    return provider.describeModel(input)
  })

  ipcMain.handle('llm:getActiveVisionProvider', async () => {
    const settings = await getProviderSettings()
    return { name: settings.vision.provider, model: settings.vision.model }
  })

  ipcMain.handle('llm:embedText', async (_event, text: string) => {
    const provider = await getActiveEmbeddingProvider()
    return provider.embedText(text)
  })

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
