import type { RenderedView } from '@/services/rendering/modelRenderer'
import type { AIModelDescription, ModelEmbedding } from '@/types/llm'
import type { ModelFile, ScannedFile } from '@/types/modelFile'
import type { GeometryMetadata, ThreeMfPackageMetadata } from '@/types/modelMetadata'
import type { ModelRenderAsset } from '@/types/modelRender'

/**
 * Persistence operations the indexing pipeline needs. In the app this is
 * backed by IPC calls into the Electron main process (bridgeBackend.ts);
 * tests provide an in-process implementation over the same repositories.
 */
export type IndexingBackend = {
  upsertModelFile(file: ScannedFile, projectId: string): Promise<ModelFile>
  readModelFile(absolutePath: string): Promise<Uint8Array>
  storeGeometryMetadata(modelFileId: string, metadata: GeometryMetadata): Promise<void>
  storeThreeMfMetadata(modelFileId: string, metadata: ThreeMfPackageMetadata): Promise<void>
  saveRenderAssets(modelFileId: string, views: RenderedView[]): Promise<ModelRenderAsset[]>
  storeAiDescription(
    modelFileId: string,
    description: AIModelDescription,
    rawResponseJson: string,
  ): Promise<void>
  storeEmbedding(embedding: Omit<ModelEmbedding, 'createdAt'>): Promise<void>
  markIndexed(modelFileId: string): Promise<void>
  markFailed(modelFileId: string, errorMessage: string): Promise<void>
}
