import type { EmbeddingProvider } from './embeddingProvider'
import type { FetchLike } from './httpVisionProvider'

/** User-facing failure from a remote embedding provider (auth, network, HTTP). */
export class EmbeddingProviderError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'EmbeddingProviderError'
    this.cause = cause
  }
}

/**
 * Base class for HTTP embedding providers: shared POST/error mapping and
 * validation that the returned vector matches the configured dimensions.
 */
export abstract class HttpEmbeddingProvider implements EmbeddingProvider {
  abstract readonly name: string

  constructor(
    readonly model: string,
    readonly dimensions: number,
    protected readonly fetchImpl: FetchLike = fetch,
  ) {}

  protected abstract requestEmbedding(text: string): Promise<number[]>

  async embedText(text: string): Promise<number[]> {
    const embedding = await this.requestEmbedding(text)
    if (embedding.length !== this.dimensions) {
      throw new EmbeddingProviderError(
        `${this.name} model "${this.model}" returned ${embedding.length} dimensions ` +
          `but the settings expect ${this.dimensions}. Update the dimensions in Settings.`,
      )
    }
    return embedding
  }

  protected async postJson(
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<unknown> {
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new EmbeddingProviderError(`Could not reach ${this.name}: ${reason}`, error)
    }
    const text = await response.text()
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new EmbeddingProviderError(
          `${this.name} rejected the API key (HTTP ${response.status}).`,
        )
      }
      throw new EmbeddingProviderError(
        `${this.name} request failed with HTTP ${response.status}: ${text.slice(0, 300)}`,
      )
    }
    return JSON.parse(text)
  }
}
