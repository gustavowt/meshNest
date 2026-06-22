import type { VisionSettings } from '@/types/providerSettings'
import type { FetchLike } from './httpVisionProvider'
import { GeminiVisionProvider } from './geminiVisionProvider'
import { MockVisionProvider } from './mockVisionProvider'
import { OllamaVisionProvider } from './ollamaVisionProvider'
import { OpenAiVisionProvider } from './openaiVisionProvider'
import type { VisionProvider } from './visionProvider'

/**
 * Builds the vision provider matching the saved settings. Used in the
 * Electron main process so API keys never reach the renderer.
 */
export function createVisionProvider(
  settings: VisionSettings,
  fetchImpl?: FetchLike,
): VisionProvider {
  switch (settings.provider) {
    case 'none':
      return {
        name: 'none',
        model: '',
        describeModel: async () => ({
          description: {
            shortName: '',
            description: '',
            likelyCategory: '',
            tags: [],
            objectsDetected: [],
            confidence: 0,
            searchPhrases: [],
          },
          rawResponseJson: '{}',
        }),
        normalizeName: async (rawName: string) => rawName,
      }
    case 'mock':
      return new MockVisionProvider()
    case 'openai':
      return new OpenAiVisionProvider(
        settings.model,
        settings.apiKey ?? '',
        settings.baseUrl || undefined,
        fetchImpl,
      )
    case 'gemini':
      return new GeminiVisionProvider(settings.model, settings.apiKey ?? '', fetchImpl)
    case 'ollama':
      return new OllamaVisionProvider(settings.model, settings.baseUrl || undefined, fetchImpl)
  }
}
