import { AiDescriptionRepository } from '../../../src/services/database/aiDescriptionRepository'
import { EmbeddingRepository } from '../../../src/services/database/embeddingRepository'
import { ensureEmbeddingTable } from '../../../src/services/database/embeddingTable'
import { buildEmbeddingSourceText } from '../../../src/services/llm/embeddingProvider'
import type { EmbeddingProvider } from '../../../src/services/llm/embeddingProvider'
import { createEmbeddingProvider } from '../../../src/services/llm/embeddingProviderFactory'
import { BuiltinEmbeddingProvider } from './builtinEmbedding'
import { getDatabaseClient } from './database'
import { getProviderSettings } from './providerSettings'

/** Builds the embedding provider configured in Settings (incl. built-in). */
export async function getActiveEmbeddingProvider(): Promise<EmbeddingProvider> {
  const settings = await getProviderSettings()
  return createEmbeddingProvider(settings.embedding, {
    builtinFactory: (embedding) =>
      new BuiltinEmbeddingProvider(embedding.model, embedding.dimensions),
  })
}

export type ReembedOutcome = {
  embedded: number
  failed: number
  /** First failure message, surfaced to the user. */
  errorMessage?: string
}

/**
 * Regenerates embeddings for every model that already has an AI
 * description, using the currently configured embedding provider.
 * Used after switching embedding providers (no re-render or vision
 * calls needed: the stored descriptions are reused).
 */
export async function reembedAllModels(): Promise<ReembedOutcome> {
  const client = await getDatabaseClient()
  const provider = await getActiveEmbeddingProvider()
  if (provider.name === 'none') {
    return { embedded: 0, failed: 0 }
  }
  await ensureEmbeddingTable(client, provider.dimensions)

  const descriptions = await new AiDescriptionRepository(client).listAll()
  const embeddingRepository = new EmbeddingRepository(client)

  let embedded = 0
  let failed = 0
  let errorMessage: string | undefined
  for (const { modelFileId, description } of descriptions) {
    try {
      const sourceText = buildEmbeddingSourceText(description)
      const embedding = await provider.embedText(sourceText)
      await embeddingRepository.upsert({
        modelFileId,
        provider: provider.name,
        model: provider.model,
        dimensions: provider.dimensions,
        embedding,
        sourceText,
      })
      embedded++
    } catch (error) {
      failed++
      errorMessage ??= error instanceof Error ? error.message : String(error)
    }
  }
  return { embedded, failed, errorMessage }
}
