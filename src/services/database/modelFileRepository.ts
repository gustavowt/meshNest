import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { ModelFile, ModelFileStatus, ScannedFile, SupportedModelExtension } from '@/types/modelFile'
import type { SqliteClient } from './sqliteClient'

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

export type UpsertModelFileOptions = {
  /** Disable content-hash relocation when a full re-scan is re-adding failed rows. */
  relocateByHash?: boolean
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
    modifiedAt: row.modified_at.endsWith('Z')
      ? new Date(row.modified_at).toISOString()
      : new Date(`${row.modified_at}Z`).toISOString(),
    contentHash: row.content_hash,
    indexedAt: row.indexed_at
      ? row.indexed_at.endsWith('Z')
        ? new Date(row.indexed_at).toISOString()
        : new Date(`${row.indexed_at}Z`).toISOString()
      : undefined,
    status: row.status as ModelFileStatus,
    errorMessage: row.error_message ?? undefined,
  }
}

function isAbsolutePathUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const code = error && typeof error === 'object' && 'code' in error ? String((error as any).code) : ''
  return (
    (message.includes('UNIQUE constraint failed') && message.includes('absolute_path')) ||
    (code === 'SQLITE_CONSTRAINT_UNIQUE' && message.includes('absolute_path')) ||
    (message.includes('Duplicate key') && message.includes('absolute_path'))
  )
}

/**
 * Persistence for discovered model files. All access to the model_files
 * table goes through this repository so SQL never leaks into UI code.
 */
export class ModelFileRepository {
  private static readonly upsertLocks = new Map<string, Promise<void>>()

  constructor(private readonly client: SqliteClient) {}

  /**
   * Inserts a newly discovered file or updates an existing record (matched
   * by absolute path). When file content changed, the record is reset to
   * 'pending' so the indexing pipeline picks it up again. Unchanged files
   * are returned as-is.
   */
  async upsertModelFile(
    file: ScannedFile,
    projectId: string,
    options: UpsertModelFileOptions = {},
  ): Promise<ModelFile> {
    return ModelFileRepository.withUpsertLock(file.absolutePath, () =>
      this.upsertModelFileUnlocked(file, projectId, options),
    )
  }

  private async upsertModelFileUnlocked(
    file: ScannedFile,
    projectId: string,
    options: UpsertModelFileOptions,
  ): Promise<ModelFile> {
    const existing = await this.findByPath(file.absolutePath)

    if (existing) {
      return this.updateExistingFromScan(existing, file)
    }

    if (options.relocateByHash !== false) {
      const relocated = this.pickRelocationCandidate(
        await this.findByHash(file.contentHash),
        file,
        projectId,
      )
      if (relocated) {
        await this.relocateModelFile(relocated.id, file)
        return (await this.findById(relocated.id))!
      }
    }

    return this.insertModelFile(file, projectId)
  }

  private static async withUpsertLock<T>(
    absolutePath: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = ModelFileRepository.upsertLocks.get(absolutePath) ?? Promise.resolve()
    let release = () => {}
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const next = previous.catch(() => undefined).then(() => current)
    ModelFileRepository.upsertLocks.set(absolutePath, next)

    await previous.catch(() => undefined)
    try {
      return await operation()
    } finally {
      release()
      if (ModelFileRepository.upsertLocks.get(absolutePath) === next) {
        ModelFileRepository.upsertLocks.delete(absolutePath)
      }
    }
  }

  private async updateExistingFromScan(existing: ModelFile, file: ScannedFile): Promise<ModelFile> {
    if (!this.hasFileChanged(existing, file)) {
      return existing
    }

    await this.client.run(
      `UPDATE model_files SET
         relative_path = @relativePath,
         filename = @filename,
         size_bytes = @sizeBytes,
         modified_at = @modifiedAt,
         content_hash = @contentHash,
         status = 'pending',
         error_message = NULL,
         indexed_at = NULL,
         updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       WHERE id = @id`,
      {
        id: existing.id,
        relativePath: file.relativePath,
        filename: file.filename,
        sizeBytes: file.sizeBytes,
        modifiedAt: file.modifiedAt,
        contentHash: file.contentHash,
      },
    )
    return (await this.findById(existing.id))!
  }

  private async insertModelFile(file: ScannedFile, projectId: string): Promise<ModelFile> {
    const id = randomUUID()
    try {
      await this.client.run(
        `INSERT INTO model_files (
           id, project_id, absolute_path, relative_path, filename, extension,
           size_bytes, modified_at, content_hash, status
         ) VALUES (
           @id, @projectId, @absolutePath, @relativePath, @filename, @extension,
           @sizeBytes, @modifiedAt, @contentHash, 'pending'
         )`,
        {
          id,
          projectId,
          absolutePath: file.absolutePath,
          relativePath: file.relativePath,
          filename: file.filename,
          extension: file.extension,
          sizeBytes: file.sizeBytes,
          modifiedAt: file.modifiedAt,
          contentHash: file.contentHash,
        },
      )
    } catch (error) {
      if (!isAbsolutePathUniqueViolation(error)) {
        throw error
      }
      const existing = await this.findByPath(file.absolutePath)
      if (!existing) {
        throw error
      }
      return this.updateExistingFromScan(existing, file)
    }
    return (await this.findByPath(file.absolutePath))!
  }

  async findByPath(absolutePath: string): Promise<ModelFile | undefined> {
    const rows = await this.client.all<ModelFileRow>(
      `SELECT ${SELECT_COLUMNS} FROM model_files WHERE absolute_path = @absolutePath`,
      { absolutePath },
    )
    return rows.length > 0 ? toModelFile(rows[0]) : undefined
  }

  async findById(id: string): Promise<ModelFile | undefined> {
    const rows = await this.client.all<ModelFileRow>(
      `SELECT ${SELECT_COLUMNS} FROM model_files WHERE id = @id`,
      { id },
    )
    return rows.length > 0 ? toModelFile(rows[0]) : undefined
  }

  async findByHash(contentHash: string): Promise<ModelFile[]> {
    const rows = await this.client.all<ModelFileRow>(
      `SELECT ${SELECT_COLUMNS} FROM model_files WHERE content_hash = @contentHash ORDER BY absolute_path`,
      { contentHash },
    )
    return rows.map(toModelFile)
  }

  async listModelFiles(projectId?: string): Promise<ModelFile[]> {
    const rows = projectId
      ? await this.client.all<ModelFileRow>(
          `SELECT ${SELECT_COLUMNS} FROM model_files WHERE project_id = @projectId ORDER BY relative_path`,
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
           WHERE status = 'pending' AND project_id = @projectId ORDER BY relative_path`,
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
         status = 'indexed',
         indexed_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
         error_message = NULL,
         updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       WHERE id = @id`,
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
    await this.updateAbsolutePath(id, location.absolutePath)
    await this.client.run(
      `UPDATE model_files SET
         relative_path = @relativePath,
         filename = @filename,
         updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       WHERE id = @id`,
      {
        id,
        relativePath: location.relativePath,
        filename: location.filename,
      },
    )
  }

  /**
   * Updates on-disk location columns when the same file content is found
   * at a new path (e.g. renamed outside the app). Indexing status and
   * content hash are preserved.
   */
  async relocateModelFile(id: string, file: ScannedFile): Promise<void> {
    await this.updateAbsolutePath(id, file.absolutePath)
    await this.client.run(
      `UPDATE model_files SET
         relative_path = @relativePath,
         filename = @filename,
         size_bytes = @sizeBytes,
         modified_at = @modifiedAt,
         updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       WHERE id = @id`,
      {
        id,
        relativePath: file.relativePath,
        filename: file.filename,
        sizeBytes: file.sizeBytes,
        modifiedAt: file.modifiedAt,
      },
    )
  }

  /**
   * Removes a model file and every dependent record (metadata, renders,
   * AI description, embedding, indexing history). There are no database-level
   * cascades, so each table is cleared explicitly.
   */
  async deleteModelFile(id: string): Promise<void> {
    await this.client.run(`DELETE FROM geometry_metadata WHERE model_file_id = @id`, { id })
    await this.client.run(`DELETE FROM three_mf_metadata WHERE model_file_id = @id`, { id })
    await this.client.run(`DELETE FROM model_render_assets WHERE model_file_id = @id`, { id })
    await this.client.run(`DELETE FROM ai_model_descriptions WHERE model_file_id = @id`, { id })
    await this.client.run(`DELETE FROM model_embeddings WHERE model_file_id = @id`, { id })
    await this.client.run(`DELETE FROM indexing_jobs WHERE model_file_id = @id`, { id })
    await this.client.run(`DELETE FROM model_files WHERE id = @id`, { id })
  }

  /**
   * Removes failed model records only. This is DB-only cleanup used before
   * a full re-scan so source files remain on disk and can be rediscovered.
   */
  async deleteFailedModelFiles(projectId?: string): Promise<string[]> {
    const rows = projectId
      ? await this.client.all<{ id: string }>(
          `SELECT id FROM model_files
           WHERE status = 'failed' AND project_id = @projectId
           ORDER BY relative_path`,
          { projectId },
        )
      : await this.client.all<{ id: string }>(
          `SELECT id FROM model_files
           WHERE status = 'failed'
           ORDER BY relative_path`,
        )
    for (const row of rows) {
      await this.deleteModelFile(row.id)
    }
    return rows.map((row) => row.id)
  }

  /** Forces a file back to 'pending' so the next indexing run reprocesses it. */
  async resetToPending(id: string): Promise<void> {
    await this.client.run(
      `UPDATE model_files SET
         status = 'pending',
         error_message = NULL,
         indexed_at = NULL,
         updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       WHERE id = @id`,
      { id },
    )
  }

  /**
   * Forces every file (optionally scoped to a project) back to 'pending' so a
   * full re-index reprocesses the whole library even when nothing changed.
   */
  async resetAllToPending(projectId?: string): Promise<void> {
    if (projectId) {
      await this.client.run(
        `UPDATE model_files SET
           status = 'pending',
           error_message = NULL,
           indexed_at = NULL,
           updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE project_id = @projectId`,
        { projectId },
      )
      return
    }
    await this.client.run(
      `UPDATE model_files SET
         status = 'pending',
         error_message = NULL,
         indexed_at = NULL,
         updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    )
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    const update = () =>
      this.client.run(
        `UPDATE model_files SET
           status = 'failed',
           error_message = @errorMessage,
           updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = @id`,
        { id, errorMessage },
      )

    try {
      await update()
    } catch (error) {
      const file = await this.findById(id)
      if (!file) {
        throw error
      }
      await this.repairAbsolutePathIndex(id, file.absolutePath)
      await update()
    }
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

  /**
   * Older databases may still have a stale path index entry. Use a temporary
   * path so DuckDB refreshes the indexed absolute_path value before continuing.
   */
  private async updateAbsolutePath(id: string, absolutePath: string): Promise<void> {
    const current = await this.findById(id)
    if (!current || current.absolutePath === absolutePath) {
      return
    }
    await this.repairAbsolutePathIndex(id, absolutePath)
  }

  private async repairAbsolutePathIndex(id: string, absolutePath: string): Promise<void> {
    const tempPath = `__meshnest_path_${id}__`
    await this.client.run(
      `UPDATE model_files SET absolute_path = @tempPath, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE id = @id`,
      { id, tempPath },
    )
    await this.client.run(
      `UPDATE model_files SET absolute_path = @absolutePath, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE id = @id`,
      { id, absolutePath },
    )
  }

  /**
   * Picks an existing record to relink when a scan finds the same content
   * hash at a different path. Prefers a unique match in the same folder.
   */
  private pickRelocationCandidate(
    candidates: readonly ModelFile[],
    file: ScannedFile,
    projectId: string,
  ): ModelFile | undefined {
    const fileDir = path.dirname(file.absolutePath).toLowerCase()
    const sameDir = candidates.filter(
      (candidate) =>
        candidate.projectId === projectId &&
        candidate.absolutePath !== file.absolutePath &&
        path.dirname(candidate.absolutePath).toLowerCase() === fileDir,
    )
    return sameDir.length === 1 ? sameDir[0] : undefined
  }
}
