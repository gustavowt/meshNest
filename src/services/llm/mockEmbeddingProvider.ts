import { EMBEDDING_DIMENSIONS } from '@/services/database/schema'
import type { EmbeddingProvider } from './embeddingProvider'

/**
 * Deterministic development embedding provider using feature hashing:
 * every token is hashed into a handful of vector positions, so texts that
 * share words produce similar vectors. This makes mock semantic search
 * behave plausibly without any real model.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock'
  readonly model = 'mock-embedding-1'
  readonly dimensions = EMBEDDING_DIMENSIONS

  async embedText(text: string): Promise<number[]> {
    const vector = new Array<number>(this.dimensions).fill(0)
    const tokens = text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)

    for (const token of tokens) {
      // Each token lights up three hashed positions with hashed signs.
      for (let salt = 0; salt < 3; salt += 1) {
        const hash = hashString(`${salt}:${token}`)
        const index = hash % this.dimensions
        const sign = (hash >>> 8) % 2 === 0 ? 1 : -1
        vector[index] += sign
      }
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
    if (norm === 0) {
      // Stable fallback for empty input.
      vector[0] = 1
      return vector
    }
    return vector.map((value) => value / norm)
  }
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
