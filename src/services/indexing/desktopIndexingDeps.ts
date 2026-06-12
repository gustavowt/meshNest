import { createBridgeEmbeddingProvider } from '@/services/llm/bridgeEmbeddingProvider'
import { createBridgeVisionProvider } from '@/services/llm/bridgeVisionProvider'
import { createBridgeIndexingBackend, createBridgeJobTracker } from './bridgeBackend'
import type { IndexFilesDeps } from './indexDirectory'

/**
 * Default production wiring for the indexing pipeline inside the
 * desktop renderer. Vision and embedding calls run in the Electron
 * main process with the providers configured in Settings.
 */
export async function createDesktopIndexingDeps(): Promise<IndexFilesDeps> {
  const [visionProvider, embeddingProvider] = await Promise.all([
    createBridgeVisionProvider(),
    createBridgeEmbeddingProvider(),
  ])
  return {
    backend: createBridgeIndexingBackend(),
    jobTracker: createBridgeJobTracker(),
    visionProvider,
    embeddingProvider,
  }
}
