import type { ThreeMfPackageMetadata } from '@/types/modelMetadata'
import type { SqliteClient } from './sqliteClient'

type ThreeMfMetadataRow = {
  object_names: string[] | string | null
  material_names: string[] | string | null
  color_values: string[] | string | null
  has_thumbnail: boolean | number | null
  thumbnail_internal_path: string | null
  raw_metadata_json: string | null
}

function parseStringList(val: string[] | string | null | undefined): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  try {
    const parsed = JSON.parse(val)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function toMetadata(row: ThreeMfMetadataRow): ThreeMfPackageMetadata {
  return {
    objectNames: parseStringList(row.object_names),
    materialNames: parseStringList(row.material_names),
    colorValues: parseStringList(row.color_values),
    hasThumbnail: Boolean(row.has_thumbnail),
    thumbnailInternalPath: row.thumbnail_internal_path ?? undefined,
    rawMetadataJson: row.raw_metadata_json ?? '{}',
  }
}

export class ThreeMfMetadataRepository {
  constructor(private readonly client: SqliteClient) {}

  /** Replaces any existing 3MF metadata for the model file. */
  async upsert(modelFileId: string, metadata: ThreeMfPackageMetadata): Promise<void> {
    await this.client.run('DELETE FROM three_mf_metadata WHERE model_file_id = @modelFileId', {
      modelFileId,
    })
    await this.client.run(
      `INSERT INTO three_mf_metadata (
         model_file_id, object_names, material_names, color_values,
         has_thumbnail, thumbnail_internal_path, raw_metadata_json
       ) VALUES (
         @modelFileId, @objectNames, @materialNames, @colorValues,
         @hasThumbnail, @thumbnailInternalPath, @rawMetadataJson
       )`,
      {
        modelFileId,
        objectNames: JSON.stringify(metadata.objectNames ?? []),
        materialNames: JSON.stringify(metadata.materialNames ?? []),
        colorValues: JSON.stringify(metadata.colorValues ?? []),
        hasThumbnail: metadata.hasThumbnail ? 1 : 0,
        thumbnailInternalPath: metadata.thumbnailInternalPath ?? null,
        rawMetadataJson: metadata.rawMetadataJson,
      },
    )
  }

  async getByModelFileId(modelFileId: string): Promise<ThreeMfPackageMetadata | undefined> {
    const query = `SELECT object_names, material_names, color_values, has_thumbnail,
              thumbnail_internal_path, raw_metadata_json
         FROM three_mf_metadata WHERE model_file_id = @modelFileId`
    const rows = await this.client.all<ThreeMfMetadataRow>(query, { modelFileId })
    return rows.length > 0 ? toMetadata(rows[0]) : undefined
  }
}
