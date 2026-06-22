import { createBridgeEmbeddingProvider } from '@/services/llm/bridgeEmbeddingProvider'
import { createBridgeVisionProvider } from '@/services/llm/bridgeVisionProvider'
import type { ModelScene } from '@/services/model-parsing/modelScene'
import { loadStlSceneAsync } from '@/services/model-parsing/stlLoaderService'
import { loadThreeMfSceneAsync } from '@/services/model-parsing/threeMfLoaderService'
import { renderModelViewsAsync } from '@/services/rendering/modelRenderer'
import { loadCachedProviderSettings } from '@/services/settings/providerSettingsCache'
import type { SupportedModelExtension } from '@/types/modelFile'
import { createBridgeIndexingBackend, createBridgeJobTracker } from './bridgeBackend'
import type { IndexFilesDeps } from './indexDirectory'

/**
 * Parses model bytes off the main thread in a Web Worker so large models
 * no longer freeze the UI during indexing/reindexing. Mirrors the model
 * preview loader; 3MF base-material display colors are preserved on this path.
 */
function loadModelSceneOffThread(
  bytes: Uint8Array,
  extension: SupportedModelExtension,
): Promise<ModelScene> {
  return extension === 'stl' ? loadStlSceneAsync(bytes) : loadThreeMfSceneAsync(bytes)
}

/**
 * Yields one frame so the reindex spinner / indexing progress bar can
 * paint before the synchronous WebGL render runs on the main thread.
 */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
    } else {
      setTimeout(resolve, 0)
    }
  })
}

/**
 * Default production wiring for the indexing pipeline inside the
 * desktop renderer. Vision and embedding calls run in the Electron
 * main process with the providers configured in Settings. Model parsing
 * runs off-thread so the UI stays responsive on large models.
 */
export async function createDesktopIndexingDeps(): Promise<IndexFilesDeps> {
  const settings = loadCachedProviderSettings()
  const [visionProvider, embeddingProvider] = await Promise.all([
    createBridgeVisionProvider(settings?.vision),
    createBridgeEmbeddingProvider(settings?.embedding),
  ])
  return {
    backend: createBridgeIndexingBackend(),
    jobTracker: createBridgeJobTracker(),
    visionProvider,
    embeddingProvider,
    loadScene: loadModelSceneOffThread,
    beforeRender: yieldToBrowser,
    renderViews: renderModelViewsAsync,
  }
}
