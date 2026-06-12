import type { EmbeddingSettings } from '@/types/providerSettings'
import type { EmbeddingProvider } from './embeddingProvider'
import type { FetchLike } from './httpVisionProvider'
import { GeminiEmbeddingProvider } from './geminiEmbeddingProvider'
import { MockEmbeddingProvider } from './mockEmbeddingProvider'
import { OllamaEmbeddingProvider } from './ollamaEmbeddingProvider'
import { OpenAiEmbeddingProvider } from './openaiEmbeddingProvider'

export type CreateEmbeddingProviderOptions = {
  fetchImpl?: FetchLike
  /**
   * Builds the built-in local (transformers.js) provider. Only supplied
   * by the Electron main process, where the model actually runs.
   */
  builtinFactory?: (settings: EmbeddingSettings) => EmbeddingProvider
}

/** Builds the embedding provider matching the saved settings. */
export function createEmbeddingProvider(
  settings: EmbeddingSettings,
  options: CreateEmbeddingProviderOptions = {},
): EmbeddingProvider {
  switch (settings.provider) {
    case 'builtin':
      if (!options.builtinFactory) {
        throw new Error('The built-in embedding model only runs in the Electron main process.')
      }
      return options.builtinFactory(settings)
    case 'mock':
      return new MockEmbeddingProvider()
    case 'openai':
      return new OpenAiEmbeddingProvider(
        settings.model,
        settings.dimensions,
        settings.apiKey ?? '',
        settings.baseUrl || undefined,
        options.fetchImpl,
      )
    case 'gemini':
      return new GeminiEmbeddingProvider(
        settings.model,
        settings.dimensions,
        settings.apiKey ?? '',
        options.fetchImpl,
      )
    case 'ollama':
      return new OllamaEmbeddingProvider(
        settings.model,
        settings.dimensions,
        settings.baseUrl || undefined,
        options.fetchImpl,
      )
  }
}
