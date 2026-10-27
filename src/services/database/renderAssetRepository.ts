import { randomUUID } from 'node:crypto'
import type { ModelRenderAsset, RenderViewName } from '@/types/modelRender'
import type { SqliteClient } from './sqliteClient'

type RenderAssetRow = {
  id: string
  model_file_id: string
  view_name: string
  absolute_path: string
  width: number
  height: number
  created_at: string
}

function toRenderAsset(row: RenderAssetRow): ModelRenderAsset {
  return {
    id: row.id,
    modelFileId: row.model_file_id,
    viewName: row.view_name as RenderViewName,
    absolutePath: row.absolute_path,
    width: Number(row.width),
    height: Number(row.height),
    createdAt: row.created_at,
  }
}

export type NewRenderAsset = Omit<ModelRenderAsset, 'id' | 'createdAt'>

export class RenderAssetRepository {
  constructor(private readonly client: SqliteClient) {}

  /**
   * Replaces all render asset records for a model file in one step,
   * keeping database records aligned with the files on disk.
   */
  async replaceForModelFile(modelFileId: string, assets: NewRenderAsset[]): Promise<void> {
    await this.deleteByModelFileId(modelFileId)
    for (const asset of assets) {
      await this.client.run(
        `INSERT INTO model_render_assets (id, model_file_id, view_name, absolute_path, width, height)
         VALUES (@id, @modelFileId, @viewName, @absolutePath, @width, @height)`,
        {
          id: randomUUID(),
          modelFileId: asset.modelFileId,
          viewName: asset.viewName,
          absolutePath: asset.absolutePath,
          width: asset.width,
          height: asset.height,
        },
      )
    }
  }

  async listByModelFileId(modelFileId: string): Promise<ModelRenderAsset[]> {
    const query = `SELECT id, model_file_id, view_name, absolute_path, width, height, created_at
         FROM model_render_assets WHERE model_file_id = @modelFileId ORDER BY view_name`
    const rows = await this.client.all<RenderAssetRow>(query, { modelFileId })
    return rows.map(toRenderAsset)
  }

  async findThumbnail(modelFileId: string): Promise<ModelRenderAsset | undefined> {
    const query = `SELECT id, model_file_id, view_name, absolute_path, width, height, created_at
         FROM model_render_assets WHERE model_file_id = @modelFileId AND view_name = 'thumbnail'`
    const rows = await this.client.all<RenderAssetRow>(query, { modelFileId })
    return rows.length > 0 ? toRenderAsset(rows[0]) : undefined
  }

  async deleteByModelFileId(modelFileId: string): Promise<void> {
    const query = 'DELETE FROM model_render_assets WHERE model_file_id = @modelFileId'
    await this.client.run(query, { modelFileId })
  }
}
