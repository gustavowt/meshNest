import type { SupportedModelExtension } from './modelFile'

/**
 * A single semantic/hybrid search hit, joined with the metadata
 * needed to render a result card.
 */
export type SearchResult = {
  modelFileId: string
  filename: string
  absolutePath: string
  extension: SupportedModelExtension
  shortName?: string
  description?: string
  likelyCategory?: string
  tags: string[]
  thumbnailPath?: string
  /** Cosine distance from the query embedding (lower is closer). */
  distance: number
  /** Normalized relevance score between 0 and 1 (higher is better). */
  score: number
}

export type SearchFilters = {
  extensions?: SupportedModelExtension[]
  categories?: string[]
  tags?: string[]
  status?: string[]
  minWidthMm?: number
  maxWidthMm?: number
  minHeightMm?: number
  maxHeightMm?: number
  minDepthMm?: number
  maxDepthMm?: number
  modifiedAfter?: string
  modifiedBefore?: string
}

export type SearchQuery = {
  text: string
  limit?: number
  filters?: SearchFilters
}
