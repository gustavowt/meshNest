export type VisionProviderId = 'mock' | 'openai' | 'gemini' | 'ollama'

export type EmbeddingProviderId = 'builtin' | 'mock' | 'openai' | 'gemini' | 'ollama'

/**
 * Configuration of the vision-capable LLM used for visual enrichment.
 */
export type VisionSettings = {
  provider: VisionProviderId
  model: string
  apiKey?: string
  /** Override for OpenAI-compatible or Ollama endpoints. */
  baseUrl?: string
}

/**
 * Configuration of the text embedding service used for semantic search.
 */
export type EmbeddingSettings = {
  provider: EmbeddingProviderId
  model: string
  apiKey?: string
  baseUrl?: string
  /** Vector size produced by the configured model. */
  dimensions: number
}

export type ProviderSettings = {
  vision: VisionSettings
  embedding: EmbeddingSettings
}

export type ProviderTestResult = {
  ok: boolean
  message: string
}
