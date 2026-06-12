import type { EmbeddingProvider } from '@/services/llm/embeddingProvider'
import type { SearchResult } from '@/types/search'

export type SemanticSearchOptions = {
  limit?: number
  projectId?: string
}

export type SemanticSearchDeps = {
  embeddingProvider: EmbeddingProvider
  /** Executes the vector query (over IPC in production, in-process in tests). */
  searchByEmbedding: (embedding: number[], options: SemanticSearchOptions) => Promise<SearchResult[]>
}

/**
 * Searches indexed models with a natural language query: embeds the
 * query text and ranks stored embeddings by cosine distance.
 * Blank queries resolve to an empty result list.
 */
export async function semanticSearch(
  query: string,
  deps: SemanticSearchDeps,
  options: SemanticSearchOptions = {},
): Promise<SearchResult[]> {
  const trimmed = query.trim()
  if (trimmed.length === 0) {
    return []
  }
  const embedding = await deps.embeddingProvider.embedText(trimmed)
  return deps.searchByEmbedding(embedding, options)
}

/**
 * Production deps: mock embedding provider (until configurable real
 * providers) and the IPC-backed vector query.
 */
export function createDesktopSearchDeps(embeddingProvider: EmbeddingProvider): SemanticSearchDeps {
  const bridge = window.meshNest
  if (!bridge) {
    throw new Error('Search requires the desktop app')
  }
  return {
    embeddingProvider,
    searchByEmbedding: (embedding, options) => bridge.searchByEmbedding(embedding, options),
  }
}
