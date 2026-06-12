export type IndexingJobType = 'index' | 'reindex' | 'retry'

export type IndexingJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type IndexingJob = {
  id: string
  modelFileId?: string
  absolutePath: string
  jobType: IndexingJobType
  status: IndexingJobStatus
  errorMessage?: string
  startedAt?: string
  finishedAt?: string
  createdAt?: string
}

/**
 * Progress snapshot emitted while indexing a directory.
 */
export type IndexingProgress = {
  total: number
  processed: number
  indexed: number
  skipped: number
  failed: number
  pending: number
  currentFile?: string
}

/**
 * Outcome of indexing a single file.
 */
export type IndexingResult = {
  modelFileId: string
  status: 'indexed' | 'skipped' | 'failed'
  errorMessage?: string
}
