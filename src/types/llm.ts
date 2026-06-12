/**
 * Structured description returned by a vision-capable LLM for a set
 * of rendered model views. This is the semantic source of truth used
 * to build embeddings.
 */
export type AIModelDescription = {
  shortName: string
  description: string
  likelyCategory: string
  tags: string[]
  objectsDetected: string[]
  printUse?: string
  style?: string
  /** Provider confidence between 0 and 1. */
  confidence: number
  searchPhrases: string[]
}

/**
 * An embedding vector generated from AI description source text.
 */
export type ModelEmbedding = {
  modelFileId: string
  provider: string
  model: string
  dimensions: number
  embedding: number[]
  sourceText: string
  createdAt?: string
}

/**
 * Image payload sent to a vision provider.
 */
export type VisionImageInput = {
  viewName: string
  /** PNG content encoded as base64, without data URL prefix. */
  base64Png: string
}
