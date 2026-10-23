import type { GeometryMetadata } from '@/types/modelMetadata'
import type { DuckDbClient } from './duckdbClient'
import type { SqliteClient } from './sqliteClient'

type GeometryMetadataRow = {
  width_mm: number | null
  height_mm: number | null
  depth_mm: number | null
  triangle_count: number | string | null
  vertex_count: number | string | null
  mesh_count: number | string | null
  object_count: number | string | null
  surface_area_mm2: number | null
  volume_mm3: number | null
  is_watertight: boolean | number | null
}

function toGeometryMetadata(row: GeometryMetadataRow): GeometryMetadata {
  return {
    widthMm: row.width_mm ?? undefined,
    heightMm: row.height_mm ?? undefined,
    depthMm: row.depth_mm ?? undefined,
    triangleCount: row.triangle_count !== null ? Number(row.triangle_count) : undefined,
    vertexCount: row.vertex_count !== null ? Number(row.vertex_count) : undefined,
    meshCount: row.mesh_count !== null ? Number(row.mesh_count) : undefined,
    objectCount: row.object_count !== null ? Number(row.object_count) : undefined,
    surfaceAreaMm2: row.surface_area_mm2 ?? undefined,
    volumeMm3: row.volume_mm3 ?? undefined,
    isWatertight:
      row.is_watertight === null || row.is_watertight === undefined
        ? undefined
        : Boolean(row.is_watertight),
  }
}

export class GeometryMetadataRepository {
  constructor(private readonly client: SqliteClient | DuckDbClient) {}

  private get isSqlite(): boolean {
    return 'rawDb' in this.client
  }

  /** Replaces any existing metadata for the model file. */
  async upsert(modelFileId: string, metadata: GeometryMetadata): Promise<void> {
    if (this.isSqlite) {
      await this.client.run('DELETE FROM geometry_metadata WHERE model_file_id = @modelFileId', {
        modelFileId,
      })
      await this.client.run(
        `INSERT INTO geometry_metadata (
           model_file_id, width_mm, height_mm, depth_mm, triangle_count,
           vertex_count, mesh_count, object_count, surface_area_mm2, volume_mm3, is_watertight
         ) VALUES (
           @modelFileId, @widthMm, @heightMm, @depthMm, @triangleCount,
           @vertexCount, @meshCount, @objectCount, @surfaceAreaMm2, @volumeMm3, @isWatertight
         )`,
        {
          modelFileId,
          widthMm: metadata.widthMm ?? null,
          heightMm: metadata.heightMm ?? null,
          depthMm: metadata.depthMm ?? null,
          triangleCount: metadata.triangleCount ?? null,
          vertexCount: metadata.vertexCount ?? null,
          meshCount: metadata.meshCount ?? null,
          objectCount: metadata.objectCount ?? null,
          surfaceAreaMm2: metadata.surfaceAreaMm2 ?? null,
          volumeMm3: metadata.volumeMm3 ?? null,
          isWatertight:
            metadata.isWatertight === true ? 1 : metadata.isWatertight === false ? 0 : null,
        },
      )
      return
    }

    await this.client.run('DELETE FROM geometry_metadata WHERE model_file_id = $modelFileId', {
      modelFileId,
    })
    await this.client.run(
      `INSERT INTO geometry_metadata (
         model_file_id, width_mm, height_mm, depth_mm, triangle_count,
         vertex_count, mesh_count, object_count, surface_area_mm2, volume_mm3, is_watertight
       ) VALUES (
         $modelFileId, $widthMm, $heightMm, $depthMm, $triangleCount,
         $vertexCount, $meshCount, $objectCount, $surfaceAreaMm2, $volumeMm3, $isWatertight
       )`,
      {
        modelFileId,
        widthMm: metadata.widthMm ?? null,
        heightMm: metadata.heightMm ?? null,
        depthMm: metadata.depthMm ?? null,
        triangleCount: metadata.triangleCount ?? null,
        vertexCount: metadata.vertexCount ?? null,
        meshCount: metadata.meshCount ?? null,
        objectCount: metadata.objectCount ?? null,
        surfaceAreaMm2: metadata.surfaceAreaMm2 ?? null,
        volumeMm3: metadata.volumeMm3 ?? null,
        isWatertight: metadata.isWatertight ?? null,
      },
    )
  }

  async getByModelFileId(modelFileId: string): Promise<GeometryMetadata | undefined> {
    const query = this.isSqlite
      ? `SELECT width_mm, height_mm, depth_mm, triangle_count, vertex_count,
              mesh_count, object_count, surface_area_mm2, volume_mm3, is_watertight
       FROM geometry_metadata WHERE model_file_id = @modelFileId`
      : `SELECT width_mm, height_mm, depth_mm, triangle_count, vertex_count,
              mesh_count, object_count, surface_area_mm2, volume_mm3, is_watertight
       FROM geometry_metadata WHERE model_file_id = $modelFileId`
    const rows = await this.client.all<GeometryMetadataRow>(query, { modelFileId })
    return rows.length > 0 ? toGeometryMetadata(rows[0]) : undefined
  }
}
