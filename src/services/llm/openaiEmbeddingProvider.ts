import type { FetchLike } from './httpVisionProvider'
import { EmbeddingProviderError, HttpEmbeddingProvider } from './httpEmbeddingProvider'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

type EmbeddingsResponse = {
  data?: Array<{ embedding?: number[] }>
}

/**
 * Embedding provider for OpenAI and OpenAI-compatible /embeddings
 * endpoints (set baseUrl for proxies or local OpenAI-compatible servers).
 */
export class OpenAiEmbeddingProvider extends HttpEmbeddingProvider {
  readonly name = 'openai'

  constructor(
    model: string,
    dimensions: number,
    private readonly apiKey: string,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    fetchImpl?: FetchLike,
  ) {
    super(model, dimensions, fetchImpl)
  }

  protected async requestEmbedding(text: string): Promise<number[]> {
    const response = (await this.postJson(
      `${this.baseUrl.replace(/\/$/, '')}/embeddings`,
      { Authorization: `Bearer ${this.apiKey}` },
      { model: this.model, input: text },
    )) as EmbeddingsResponse

    const embedding = response.data?.[0]?.embedding
    if (!embedding) {
      throw new EmbeddingProviderError('OpenAI response contained no embedding.')
    }
    return embedding
  }
}
