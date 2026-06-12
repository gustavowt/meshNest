import type { FetchLike } from './httpVisionProvider'
import { EmbeddingProviderError, HttpEmbeddingProvider } from './httpEmbeddingProvider'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

type EmbedContentResponse = {
  embedding?: { values?: number[] }
}

/** Embedding provider for the Google Gemini embedContent API. */
export class GeminiEmbeddingProvider extends HttpEmbeddingProvider {
  readonly name = 'gemini'

  constructor(
    model: string,
    dimensions: number,
    private readonly apiKey: string,
    fetchImpl?: FetchLike,
  ) {
    super(model, dimensions, fetchImpl)
  }

  protected async requestEmbedding(text: string): Promise<number[]> {
    const response = (await this.postJson(
      `${GEMINI_BASE}/models/${this.model}:embedContent`,
      { 'x-goog-api-key': this.apiKey },
      { content: { parts: [{ text }] } },
    )) as EmbedContentResponse

    const embedding = response.embedding?.values
    if (!embedding) {
      throw new EmbeddingProviderError('Gemini response contained no embedding values.')
    }
    return embedding
  }
}
