import type { ModelDetail } from '@/types/modelDetail'
import { AiDescriptionRepository } from './aiDescriptionRepository'
import { GeometryMetadataRepository } from './geometryMetadataRepository'
import { ModelFileRepository } from './modelFileRepository'
import { RenderAssetRepository } from './renderAssetRepository'
import type { SqliteClient } from './sqliteClient'
import { ThreeMfMetadataRepository } from './threeMfMetadataRepository'

/**
 * Aggregates everything the detail page needs for one model file.
 * Returns undefined when the file record does not exist.
 */
export async function getModelDetail(
  client: SqliteClient,
  modelFileId: string,
): Promise<ModelDetail | undefined> {
  const file = await new ModelFileRepository(client).findById(modelFileId)
  if (!file) {
    return undefined
  }

  const [geometry, threeMf, description, renderAssets] = await Promise.all([
    new GeometryMetadataRepository(client).getByModelFileId(modelFileId),
    new ThreeMfMetadataRepository(client).getByModelFileId(modelFileId),
    new AiDescriptionRepository(client).getByModelFileId(modelFileId),
    new RenderAssetRepository(client).listByModelFileId(modelFileId),
  ])

  return {
    file,
    geometry,
    threeMf: file.extension === '3mf' ? threeMf : undefined,
    description,
    renderAssets,
  }
}
