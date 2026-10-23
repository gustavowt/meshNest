import type { LibraryEntry } from '@/types/library'
import type { ModelFileStatus, SupportedModelExtension } from '@/types/modelFile'
import type { SqliteClient } from './sqliteClient'

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
  tags: string[] | string | null
  thumbnail_path: string | null
}

function parseIsoTimestamp(ts: string): string {
  return ts.endsWith('Z') ? new Date(ts).toISOString() : new Date(`${ts}Z`).toISOString()
}

function parseTags(tags: string[] | string | null): string[] {
  if (!tags) return []
  if (Array.isArray(tags)) return tags
  try {
    const parsed = JSON.parse(tags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function toLibraryEntry(row: LibraryRow): LibraryEntry {
  return {
    id: row.id,
    filename: row.filename,
    relativePath: row.relative_path,
    absolutePath: row.absolute_path,
    extension: row.extension as SupportedModelExtension,
    sizeBytes: Number(row.size_bytes),
    modifiedAt: parseIsoTimestamp(row.modified_at),
    indexedAt: row.indexed_at ? parseIsoTimestamp(row.indexed_at) : undefined,
    status: row.status as ModelFileStatus,
    errorMessage: row.error_message ?? undefined,
    shortName: row.short_name ?? undefined,
    likelyCategory: row.likely_category ?? undefined,
    tags: parseTags(row.tags),
    thumbnailPath: row.thumbnail_path ?? undefined,
  }
}

/**
 * Read model for the library view: model files joined with their AI
 * description summary and thumbnail render asset.
 */
export class LibraryRepository {
  constructor(private readonly client: SqliteClient) {}

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
          `${baseQuery} WHERE f.project_id = @projectId ORDER BY f.relative_path`,
          { projectId },
        )
      : await this.client.all<LibraryRow>(`${baseQuery} ORDER BY f.relative_path`)
    return rows.map(toLibraryEntry)
  }

  async getLibraryEntry(modelFileId: string): Promise<LibraryEntry | undefined> {
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

    const rows = await this.client.all<LibraryRow>(
      `${baseQuery} WHERE f.id = @modelFileId`,
      { modelFileId },
    )
    return rows.length > 0 ? toLibraryEntry(rows[0]) : undefined
  }
}
