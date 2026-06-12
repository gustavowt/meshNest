import type { AIModelDescription } from './llm'
import type { ModelFile } from './modelFile'
import type { GeometryMetadata, ThreeMfPackageMetadata } from './modelMetadata'
import type { ModelRenderAsset } from './modelRender'

/**
 * Everything known about one model file, aggregated for the detail page.
 */
export type ModelDetail = {
  file: ModelFile
  geometry?: GeometryMetadata
  threeMf?: ThreeMfPackageMetadata
  description?: AIModelDescription
  renderAssets: ModelRenderAsset[]
}
