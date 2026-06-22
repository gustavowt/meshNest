import { randomUUID } from 'node:crypto'
import type { ModelFile, ModelFileStatus, ScannedFile, SupportedModelExtension } from '@/types/modelFile'
import type { DuckDbClient } from './duckdbClient'

type ModelFileRow = {
  id: string
  project_id: string
  absolute_path: string
  relative_path: string
  filename: string
  extension: string
  size_bytes: number | string
  modified_at: string
  content_hash: string
  indexed_at: string | null
  status: string
  error_message: string | null
}

const SELECT_COLUMNS = `
  id, project_id, absolute_path, relative_path, filename, extension,
  size_bytes, modified_at, content_hash, indexed_at, status, error_message`

function toModelFile(row: ModelFileRow): ModelFile {
  return {
    id: row.id,
    projectId: row.project_id,
    absolutePath: row.absolute_path,
    relativePath: row.relative_path,
    filename: row.filename,
    extension: row.extension as SupportedModelExtension,
    sizeBytes: Number(row.size_bytes),
    modifiedAt: new Date(`${row.modified_at}Z`).toISOString(),
    contentHash: row.content_hash,
    indexedAt: row.indexed_at ? new Date(`${row.indexed_at}Z`).toISOString() : undefined,
    status: row.status as ModelFileStatus,
    errorMessage: row.error_message ?? undefined,
  }
}

/** Converts an ISO string into a format DuckDB parses as a UTC timestamp. */
function toDbTimestamp(isoString: string): string {
  return isoString.replace('T', ' ').replace('Z', '')
}

/**
 * Persistence for discovered model files. All access to the model_files
 * table goes through this repository so SQL never leaks into UI code.
 */
export class ModelFileRepository {
  constructor(private readonly client: DuckDbClient) {}

  /**
   * Inserts a newly discovered file or updates an existing record (matched
   * by absolute path). When file content changed, the record is reset to
   * 'pending' so the indexing pipeline picks it up again. Unchanged files
   * are returned as-is.
   */
  async upsertModelFile(file: ScannedFile, projectId: string): Promise<ModelFile> {
    const existing = await this.findByPath(file.absolutePath)

    if (!existing) {
      const id = randomUUID()
      await this.client.run(
        `INSERT INTO model_files (
           id, project_id, absolute_path, relative_path, filename, extension,
           size_bytes, modified_at, content_hash, status
         ) VALUES (
           $id, $projectId, $absolutePath, $relativePath, $filename, $extension,
           $sizeBytes, $modifiedAt::TIMESTAMP, $contentHash, 'pending'
         )`,
        {
          id,
          projectId,
          absolutePath: file.absolutePath,
          relativePath: file.relativePath,
          filename: file.filename,
          extension: file.extension,
          sizeBytes: file.sizeBytes,
          modifiedAt: toDbTimestamp(file.modifiedAt),
          contentHash: file.contentHash,
        },
      )
      return (await this.findByPath(file.absolutePath))!
    }

    if (!this.hasFileChanged(existing, file)) {
      return existing
    }

    await this.client.run(
      `UPDATE model_files SET
         relative_path = $relativePath,
         filename = $filename,
         size_bytes = $sizeBytes,
         modified_at = $modifiedAt::TIMESTAMP,
         content_hash = $contentHash,
         status = 'pending',
         error_message = NULL,
         indexed_at = NULL,
         updated_at = now()
       WHERE id = $id`,
      {
        id: existing.id,
        relativePath: file.relativePath,
        filename: file.filename,
        sizeBytes: file.sizeBytes,
        modifiedAt: toDbTimestamp(file.modifiedAt),
        contentHash: file.contentHash,
      },
    )
    return (await this.findByPath(file.absolutePath))!
  }

  async findByPath(absolutePath: string): Promise<ModelFile | undefined> {
    const rows = await this.client.all<ModelFileRow>(
      `SELECT ${SELECT_COLUMNS} FROM model_files WHERE absolute_path = $absolutePath`,
      { absolutePath },
    )
    return rows.length > 0 ? toModelFile(rows[0]) : undefined
  }

  async findById(id: string): Promise<ModelFile | undefined> {
    const rows = await this.client.all<ModelFileRow>(
      `SELECT ${SELECT_COLUMNS} FROM model_files WHERE id = $id`,
      { id },
    )
    return rows.length > 0 ? toModelFile(rows[0]) : undefined
  }

  async findByHash(contentHash: string): Promise<ModelFile[]> {
    const rows = await this.client.all<ModelFileRow>(
      `SELECT ${SELECT_COLUMNS} FROM model_files WHERE content_hash = $contentHash ORDER BY absolute_path`,
      { contentHash },
    )
    return rows.map(toModelFile)
  }

  async listModelFiles(projectId?: string): Promise<ModelFile[]> {
    const rows = projectId
      ? await this.client.all<ModelFileRow>(
          `SELECT ${SELECT_COLUMNS} FROM model_files WHERE project_id = $projectId ORDER BY relative_path`,
          { projectId },
        )
      : await this.client.all<ModelFileRow>(
          `SELECT ${SELECT_COLUMNS} FROM model_files ORDER BY relative_path`,
        )
    return rows.map(toModelFile)
  }

  async listPendingFiles(projectId?: string): Promise<ModelFile[]> {
    const rows = projectId
      ? await this.client.all<ModelFileRow>(
          `SELECT ${SELECT_COLUMNS} FROM model_files
           WHERE status = 'pending' AND project_id = $projectId ORDER BY relative_path`,
          { projectId },
        )
      : await this.client.all<ModelFileRow>(
          `SELECT ${SELECT_COLUMNS} FROM model_files WHERE status = 'pending' ORDER BY relative_path`,
        )
    return rows.map(toModelFile)
  }

  async markIndexed(id: string): Promise<void> {
    await this.client.run(
      `UPDATE model_files SET
         status = 'indexed', indexed_at = now(), error_message = NULL, updated_at = now()
       WHERE id = $id`,
      { id },
    )
  }

  /**
   * Updates the on-disk location columns after a file has been renamed
   * (or moved). Content hash and indexing status are intentionally left
   * untouched because a rename does not change the model contents.
   */
  async renameModelFile(
    id: string,
    location: { absolutePath: string; relativePath: string; filename: string },
  ): Promise<void> {
    await this.client.run(
      `UPDATE model_files SET
         absolute_path = $absolutePath,
         relative_path = $relativePath,
         filename = $filename,
         updated_at = now()
       WHERE id = $id`,
      {
        id,
        absolutePath: location.absolutePath,
        relativePath: location.relativePath,
        filename: location.filename,
      },
    )
  }

  /**
   * Removes a model file and every dependent record (metadata, renders,
   * AI description, embedding, indexing history). There are no database-level
   * cascades, so each table is cleared explicitly.
   */
  async deleteModelFile(id: string): Promise<void> {
    await this.client.run('DELETE FROM geometry_metadata WHERE model_file_id = $id', { id })
    await this.client.run('DELETE FROM three_mf_metadata WHERE model_file_id = $id', { id })
    await this.client.run('DELETE FROM model_render_assets WHERE model_file_id = $id', { id })
    await this.client.run('DELETE FROM ai_model_descriptions WHERE model_file_id = $id', { id })
    await this.client.run('DELETE FROM model_embeddings WHERE model_file_id = $id', { id })
    await this.client.run('DELETE FROM indexing_jobs WHERE model_file_id = $id', { id })
    await this.client.run('DELETE FROM model_files WHERE id = $id', { id })
  }

  /** Forces a file back to 'pending' so the next indexing run reprocesses it. */
  async resetToPending(id: string): Promise<void> {
    await this.client.run(
      `UPDATE model_files SET
         status = 'pending', error_message = NULL, indexed_at = NULL, updated_at = now()
       WHERE id = $id`,
      { id },
    )
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.client.run(
      `UPDATE model_files SET
         status = 'failed', error_message = $errorMessage, updated_at = now()
       WHERE id = $id`,
      { id, errorMessage },
    )
  }

  /**
   * A file needs (re)indexing when it was never indexed successfully or
   * when its content hash / modified timestamp no longer match the scan.
   */
  shouldReindexFile(existing: ModelFile | undefined, scanned: ScannedFile): boolean {
    if (!existing) {
      return true
    }
    if (existing.status !== 'indexed') {
      return true
    }
    return this.hasFileChanged(existing, scanned)
  }

  private hasFileChanged(existing: ModelFile, scanned: ScannedFile): boolean {
    return (
      existing.contentHash !== scanned.contentHash ||
      existing.modifiedAt !== scanned.modifiedAt ||
      existing.sizeBytes !== scanned.sizeBytes
    )
  }
}
