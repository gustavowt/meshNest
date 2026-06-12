import { normalizeModelScene } from '@/services/model-parsing/modelNormalizer'
import { loadStlScene } from '@/services/model-parsing/stlLoaderService'
import { loadThreeMfScene } from '@/services/model-parsing/threeMfLoaderService'
import type { SupportedModelExtension } from '@/types/modelFile'
import type { ModelRenderAsset } from '@/types/modelRender'
import { renderModelViews } from './modelRenderer'
import type { RenderOptions } from './modelRenderer'

/**
 * Renderer-process orchestrator: loads a model file through the desktop
 * bridge, renders the deterministic view set, and asks the main process
 * to persist images and database records. Returns the stored assets.
 */
export async function renderAndStoreModelViews(
  modelFileId: string,
  filePath: string,
  extension: SupportedModelExtension,
  options?: RenderOptions,
): Promise<ModelRenderAsset[]> {
  if (!window.meshNest) {
    throw new Error('Rendering requires the desktop app')
  }

  const bytes = await window.meshNest.readModelFile(filePath)
  const scene = extension === 'stl' ? loadStlScene(bytes) : loadThreeMfScene(bytes)
  const normalized = normalizeModelScene(scene)
  const views = renderModelViews(normalized, options)

  return window.meshNest.saveRenderAssets(modelFileId, views)
}
