import { createBridgeVisionProvider } from '@/services/llm/bridgeVisionProvider'
import { MockEmbeddingProvider } from '@/services/llm/mockEmbeddingProvider'
import { createBridgeIndexingBackend, createBridgeJobTracker } from './bridgeBackend'
import type { IndexFilesDeps } from './indexDirectory'

/**
 * Default production wiring for the indexing pipeline inside the
 * desktop renderer. Vision runs in the Electron main process with the
 * provider configured in Settings; embeddings are still mock until the
 * real embedding service phase.
 */
export async function createDesktopIndexingDeps(): Promise<IndexFilesDeps> {
  return {
    backend: createBridgeIndexingBackend(),
    jobTracker: createBridgeJobTracker(),
    visionProvider: await createBridgeVisionProvider(),
    embeddingProvider: new MockEmbeddingProvider(),
  }
}
