import { LIST, listValue, VARCHAR } from '@duckdb/node-api'
import type { ThreeMfPackageMetadata } from '@/types/modelMetadata'
import type { DuckDbClient } from './duckdbClient'

type ThreeMfMetadataRow = {
  object_names: string[] | null
  material_names: string[] | null
  color_values: string[] | null
  has_thumbnail: boolean | null
  thumbnail_internal_path: string | null
  raw_metadata_json: string | null
}

function toMetadata(row: ThreeMfMetadataRow): ThreeMfPackageMetadata {
  return {
    objectNames: row.object_names ?? [],
    materialNames: row.material_names ?? [],
    colorValues: row.color_values ?? [],
    hasThumbnail: row.has_thumbnail ?? false,
    thumbnailInternalPath: row.thumbnail_internal_path ?? undefined,
    rawMetadataJson: row.raw_metadata_json ?? '{}',
  }
}

export class ThreeMfMetadataRepository {
  constructor(private readonly client: DuckDbClient) {}

  /** Replaces any existing 3MF metadata for the model file. */
  async upsert(modelFileId: string, metadata: ThreeMfPackageMetadata): Promise<void> {
    await this.client.run('DELETE FROM three_mf_metadata WHERE model_file_id = $modelFileId', {
      modelFileId,
    })
    await this.client.run(
      `INSERT INTO three_mf_metadata (
         model_file_id, object_names, material_names, color_values,
         has_thumbnail, thumbnail_internal_path, raw_metadata_json
       ) VALUES (
         $modelFileId, $objectNames, $materialNames, $colorValues,
         $hasThumbnail, $thumbnailInternalPath, $rawMetadataJson
       )`,
      {
        modelFileId,
        objectNames: listValue(metadata.objectNames),
        materialNames: listValue(metadata.materialNames),
        colorValues: listValue(metadata.colorValues),
        hasThumbnail: metadata.hasThumbnail,
        thumbnailInternalPath: metadata.thumbnailInternalPath ?? null,
        rawMetadataJson: metadata.rawMetadataJson,
      },
      {
        objectNames: LIST(VARCHAR),
        materialNames: LIST(VARCHAR),
        colorValues: LIST(VARCHAR),
      },
    )
  }

  async getByModelFileId(modelFileId: string): Promise<ThreeMfPackageMetadata | undefined> {
    const rows = await this.client.all<ThreeMfMetadataRow>(
      `SELECT object_names, material_names, color_values, has_thumbnail,
              thumbnail_internal_path, raw_metadata_json
       FROM three_mf_metadata WHERE model_file_id = $modelFileId`,
      { modelFileId },
    )
    return rows.length > 0 ? toMetadata(rows[0]) : undefined
  }
}
