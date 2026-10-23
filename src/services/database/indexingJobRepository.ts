import type { IndexingJob, IndexingJobStatus, IndexingJobType } from '@/types/indexing'
import type { DuckDbClient } from './duckdbClient'
import type { SqliteClient } from './sqliteClient'

type IndexingJobRow = {
  id: string
  model_file_id: string | null
  absolute_path: string
  job_type: string
  status: string
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

function toJob(row: IndexingJobRow): IndexingJob {
  return {
    id: row.id,
    modelFileId: row.model_file_id ?? undefined,
    absolutePath: row.absolute_path,
    jobType: row.job_type as IndexingJobType,
    status: row.status as IndexingJobStatus,
    errorMessage: row.error_message ?? undefined,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    createdAt: row.created_at,
  }
}

export class IndexingJobRepository {
  constructor(private readonly client: SqliteClient | DuckDbClient) {}

  private get isSqlite(): boolean {
    return 'rawDb' in this.client
  }

  async create(job: { id: string; absolutePath: string; jobType: IndexingJobType }): Promise<void> {
    if (this.isSqlite) {
      await this.client.run(
        `INSERT INTO indexing_jobs (id, absolute_path, job_type, status)
         VALUES (@id, @absolutePath, @jobType, 'queued')`,
        { id: job.id, absolutePath: job.absolutePath, jobType: job.jobType },
      )
      return
    }

    await this.client.run(
      `INSERT INTO indexing_jobs (id, absolute_path, job_type, status)
       VALUES ($id, $absolutePath, $jobType, 'queued')`,
      { id: job.id, absolutePath: job.absolutePath, jobType: job.jobType },
    )
  }

  async markRunning(id: string): Promise<void> {
    if (this.isSqlite) {
      await this.client.run(
        `UPDATE indexing_jobs SET status = 'running', started_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE id = @id`,
        { id },
      )
      return
    }

    await this.client.run(
      `UPDATE indexing_jobs SET status = 'running', started_at = now() WHERE id = $id`,
      { id },
    )
  }

  async finish(
    id: string,
    status: Extract<IndexingJobStatus, 'succeeded' | 'failed' | 'cancelled'>,
    modelFileId?: string,
    errorMessage?: string,
  ): Promise<void> {
    if (this.isSqlite) {
      await this.client.run(
        `UPDATE indexing_jobs SET
           status = @status,
           model_file_id = @modelFileId,
           error_message = @errorMessage,
           finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = @id`,
        { id, status, modelFileId: modelFileId ?? null, errorMessage: errorMessage ?? null },
      )
      return
    }

    await this.client.run(
      `UPDATE indexing_jobs SET
         status = $status,
         model_file_id = $modelFileId,
         error_message = $errorMessage,
         finished_at = now()
       WHERE id = $id`,
      { id, status, modelFileId: modelFileId ?? null, errorMessage: errorMessage ?? null },
    )
  }

  async updateAbsolutePathForModel(modelFileId: string, absolutePath: string): Promise<void> {
    if (this.isSqlite) {
      await this.client.run(
        `UPDATE indexing_jobs SET absolute_path = @absolutePath WHERE model_file_id = @modelFileId`,
        { modelFileId, absolutePath },
      )
      return
    }

    await this.client.run(
      `UPDATE indexing_jobs SET absolute_path = $absolutePath WHERE model_file_id = $modelFileId`,
      { modelFileId, absolutePath },
    )
  }

  async updateAbsolutePath(previousAbsolutePath: string, absolutePath: string): Promise<void> {
    if (this.isSqlite) {
      await this.client.run(
        `UPDATE indexing_jobs SET absolute_path = @absolutePath WHERE absolute_path = @previousAbsolutePath`,
        { previousAbsolutePath, absolutePath },
      )
      return
    }

    await this.client.run(
      `UPDATE indexing_jobs SET absolute_path = $absolutePath WHERE absolute_path = $previousAbsolutePath`,
      { previousAbsolutePath, absolutePath },
    )
  }

  async listRecent(limit = 100): Promise<IndexingJob[]> {
    const query = this.isSqlite
      ? `SELECT id, model_file_id, absolute_path, job_type, status, error_message,
                started_at, finished_at, created_at
         FROM indexing_jobs ORDER BY created_at DESC LIMIT @limit`
      : `SELECT id, model_file_id, absolute_path, job_type, status, error_message,
                started_at, finished_at, created_at
         FROM indexing_jobs ORDER BY created_at DESC LIMIT $limit`
    const rows = await this.client.all<IndexingJobRow>(query, { limit })
    return rows.map(toJob)
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.client.all<{ status: string; c: number | string }>(
      'SELECT status, count(*) AS c FROM indexing_jobs GROUP BY status',
    )
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.c)]))
  }
}
