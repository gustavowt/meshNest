import type { FetchLike } from './httpVisionProvider'
import { EmbeddingProviderError, HttpEmbeddingProvider } from './httpEmbeddingProvider'

const DEFAULT_BASE_URL = 'http://localhost:11434'

type OllamaEmbeddingsResponse = {
  embedding?: number[]
}

/** Embedding provider for a local Ollama server (nomic-embed-text, ...). */
export class OllamaEmbeddingProvider extends HttpEmbeddingProvider {
  readonly name = 'ollama'

  constructor(
    model: string,
    dimensions: number,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    fetchImpl?: FetchLike,
  ) {
    super(model, dimensions, fetchImpl)
  }

  protected async requestEmbedding(text: string): Promise<number[]> {
    const response = (await this.postJson(
      `${this.baseUrl.replace(/\/$/, '')}/api/embeddings`,
      {},
      { model: this.model, prompt: text },
    )) as OllamaEmbeddingsResponse

    if (!response.embedding) {
      throw new EmbeddingProviderError('Ollama response contained no embedding.')
    }
    return response.embedding
  }
}
