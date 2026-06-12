import type { AIModelDescription } from '@/types/llm'

/**
 * Contract implemented by every text-embedding backend (mock,
 * OpenAI-compatible, Ollama, ...). `dimensions` must match the database
 * schema (see EMBEDDING_DIMENSIONS in services/database/schema.ts).
 */
export interface EmbeddingProvider {
  readonly name: string
  readonly model: string
  readonly dimensions: number
  embedText(text: string): Promise<number[]>
}

/**
 * Builds the canonical text that gets embedded for a model. Keeping this
 * format stable means embeddings stay comparable across reindexing runs.
 */
export function buildEmbeddingSourceText(description: AIModelDescription): string {
  const lines = [
    `Short name: ${description.shortName}`,
    `Description: ${description.description}`,
    `Category: ${description.likelyCategory}`,
    `Tags: ${description.tags.join(', ')}`,
    `Objects detected: ${description.objectsDetected.join(', ')}`,
  ]
  if (description.printUse) {
    lines.push(`Print use: ${description.printUse}`)
  }
  if (description.style) {
    lines.push(`Style: ${description.style}`)
  }
  lines.push(`Search phrases: ${description.searchPhrases.join('; ')}`)
  return lines.join('\n')
}
