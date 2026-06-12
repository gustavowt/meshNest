import { MockEmbeddingProvider } from '@/services/llm/mockEmbeddingProvider'
import { MockVisionProvider } from '@/services/llm/mockVisionProvider'
import { createBridgeIndexingBackend, createBridgeJobTracker } from './bridgeBackend'
import type { IndexFilesDeps } from './indexDirectory'

/**
 * Default production wiring for the indexing pipeline inside the
 * desktop renderer. Providers are mocks until configurable real
 * providers arrive in a later phase.
 */
export function createDesktopIndexingDeps(): IndexFilesDeps {
  return {
    backend: createBridgeIndexingBackend(),
    jobTracker: createBridgeJobTracker(),
    visionProvider: new MockVisionProvider(),
    embeddingProvider: new MockEmbeddingProvider(),
  }
}
