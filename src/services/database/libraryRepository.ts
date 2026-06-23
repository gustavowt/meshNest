import type { LibraryEntry } from '@/types/library'
import type { ModelFileStatus, SupportedModelExtension } from '@/types/modelFile'
import type { DuckDbClient } from './duckdbClient'

type LibraryRow = {
  id: string
  filename: string
  relative_path: string
  absolute_path: string
  extension: string
  size_bytes: number | string
  modified_at: string
  indexed_at: string | null
  status: string
  error_message: string | null
  short_name: string | null
  likely_category: string | null
  tags: string[] | null
  thumbnail_path: string | null
}

function toLibraryEntry(row: LibraryRow): LibraryEntry {
  return {
    id: row.id,
    filename: row.filename,
    relativePath: row.relative_path,
    absolutePath: row.absolute_path,
    extension: row.extension as SupportedModelExtension,
    sizeBytes: Number(row.size_bytes),
    modifiedAt: new Date(`${row.modified_at}Z`).toISOString(),
    indexedAt: row.indexed_at ? new Date(`${row.indexed_at}Z`).toISOString() : undefined,
    status: row.status as ModelFileStatus,
    errorMessage: row.error_message ?? undefined,
    shortName: row.short_name ?? undefined,
    likelyCategory: row.likely_category ?? undefined,
    tags: row.tags ?? [],
    thumbnailPath: row.thumbnail_path ?? undefined,
  }
}

/**
 * Read model for the library view: model files joined with their AI
 * description summary and thumbnail render asset.
 */
export class LibraryRepository {
  constructor(private readonly client: DuckDbClient) {}

  async listLibraryEntries(projectId?: string): Promise<LibraryEntry[]> {
    const baseQuery = `
      SELECT
        f.id, f.filename, f.relative_path, f.absolute_path, f.extension,
        f.size_bytes, f.modified_at, f.indexed_at, f.status, f.error_message,
        d.short_name, d.likely_category, d.tags,
        r.absolute_path AS thumbnail_path
      FROM model_files f
      LEFT JOIN ai_model_descriptions d ON d.model_file_id = f.id
      LEFT JOIN model_render_assets r
        ON r.model_file_id = f.id AND r.view_name = 'thumbnail'`

    const rows = projectId
      ? await this.client.all<LibraryRow>(
          `${baseQuery} WHERE f.project_id = $projectId ORDER BY f.relative_path`,
          { projectId },
        )
      : await this.client.all<LibraryRow>(`${baseQuery} ORDER BY f.relative_path`)
    return rows.map(toLibraryEntry)
  }

  async getLibraryEntry(modelFileId: string): Promise<LibraryEntry | undefined> {
    const rows = await this.client.all<LibraryRow>(
      `
      SELECT
        f.id, f.filename, f.relative_path, f.absolute_path, f.extension,
        f.size_bytes, f.modified_at, f.indexed_at, f.status, f.error_message,
        d.short_name, d.likely_category, d.tags,
        r.absolute_path AS thumbnail_path
      FROM model_files f
      LEFT JOIN ai_model_descriptions d ON d.model_file_id = f.id
      LEFT JOIN model_render_assets r
        ON r.model_file_id = f.id AND r.view_name = 'thumbnail'
      WHERE f.id = $modelFileId`,
      { modelFileId },
    )
    return rows.length > 0 ? toLibraryEntry(rows[0]) : undefined
  }
}
