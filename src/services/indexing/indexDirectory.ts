import type { IndexingJobType, IndexingProgress, IndexingResult } from '@/types/indexing'
import type { ScannedFile } from '@/types/modelFile'
import { indexModelFile } from './indexModelFile'
import type { IndexModelFileDeps } from './indexModelFile'
import { processIndexQueue } from './indexQueue'

/**
 * Persists per-file job records so queue history survives crashes and
 * cancellations and can explain what happened after a run.
 */
export type IndexingJobTracker = {
  createJob(job: { id: string; absolutePath: string; jobType: IndexingJobType }): Promise<void>
  markJobRunning(id: string): Promise<void>
  finishJob(
    id: string,
    status: 'succeeded' | 'failed' | 'cancelled',
    modelFileId?: string,
    errorMessage?: string,
  ): Promise<void>
}

export type IndexFilesOptions = {
  concurrency?: number
  signal?: AbortSignal
  onProgress?: (progress: IndexingProgress) => void
  /** Called after each file finishes indexing, skipping, or failing. */
  onFileComplete?: (file: ScannedFile, result: IndexingResult) => void | Promise<void>
  /** Recorded on job rows; 'retry' when re-running failed files. */
  jobType?: IndexingJobType
}

export type IndexFilesDeps = IndexModelFileDeps & {
  /** Optional job persistence; omit to run without queue history. */
  jobTracker?: IndexingJobTracker
}

export type IndexDirectorySummary = {
  total: number
  indexed: number
  skipped: number
  failed: number
  /** Files never processed because the run was cancelled. */
  pending: number
  cancelled: boolean
}

export type IndexFilesOutcome = {
  summary: IndexDirectorySummary
  /**
   * Result for each processed file, keyed by absolute path. Files left
   * pending after a cancellation have no entry.
   */
  resultsByPath: Map<string, IndexingResult>
}

/**
 * Indexes a list of scanned files through a bounded-concurrency queue.
 * Each file gets a persisted indexing job (queued -> running -> final),
 * progress is reported via onProgress, and aborting the signal stops
 * new work while in-flight files finish.
 */
export async function indexScannedFiles(
  files: readonly ScannedFile[],
  projectId: string,
  deps: IndexFilesDeps,
  options: IndexFilesOptions = {},
): Promise<IndexFilesOutcome> {
  const { jobTracker, ...fileDeps } = deps
  const jobType = options.jobType ?? 'index'
  const jobIds = new Map<ScannedFile, string>()

  if (jobTracker) {
    for (const file of files) {
      const id = crypto.randomUUID()
      jobIds.set(file, id)
      await jobTracker.createJob({ id, absolutePath: file.absolutePath, jobType })
    }
  }

  const worker = async (file: ScannedFile): Promise<IndexingResult> => {
    const jobId = jobIds.get(file)
    if (jobTracker && jobId) {
      await jobTracker.markJobRunning(jobId)
    }
    const result = await indexModelFile(file, projectId, fileDeps)
    if (jobTracker && jobId) {
      await jobTracker.finishJob(
        jobId,
        result.status === 'failed' ? 'failed' : 'succeeded',
        result.modelFileId || undefined,
        result.errorMessage,
      )
    }
    return result
  }

  const outcome = await processIndexQueue(files, worker, {
    concurrency: options.concurrency,
    signal: options.signal,
    onProgress: options.onProgress,
    onItemComplete: options.onFileComplete,
    itemLabel: (file) => file.relativePath,
  })

  const resultsByPath = new Map<string, IndexingResult>()
  outcome.results.forEach((result, index) => {
    if (result) {
      resultsByPath.set(files[index].absolutePath, result)
    }
  })

  if (jobTracker && outcome.cancelled) {
    for (const file of files) {
      const jobId = jobIds.get(file)
      if (jobId && !resultsByPath.has(file.absolutePath)) {
        await jobTracker.finishJob(jobId, 'cancelled')
      }
    }
  }

  return {
    summary: summarizeResults(files.length, [...resultsByPath.values()], outcome.cancelled),
    resultsByPath,
  }
}

export type IndexDirectoryOutcome = IndexFilesOutcome & {
  /** Files discovered by the scan, in deterministic order. */
  files: ScannedFile[]
}

/**
 * Scans a directory through the desktop bridge and indexes every
 * discovered file through the queue.
 */
export async function indexDirectory(
  directory: string,
  projectId: string,
  deps: IndexFilesDeps,
  options: IndexFilesOptions & { scanId?: string } = {},
): Promise<IndexDirectoryOutcome> {
  const bridge = window.meshNest
  if (!bridge) {
    throw new Error('Indexing requires the desktop app')
  }
  const files = await bridge.scanDirectory(directory, options.scanId ?? crypto.randomUUID())
  const outcome = await indexScannedFiles(files, projectId, deps, options)
  return { ...outcome, files }
}

/**
 * Re-runs indexing only for files whose previous result was 'failed'.
 */
export async function retryFailedFiles(
  files: readonly ScannedFile[],
  previousResults: ReadonlyMap<string, IndexingResult>,
  projectId: string,
  deps: IndexFilesDeps,
  options: IndexFilesOptions = {},
): Promise<IndexFilesOutcome> {
  const failedFiles = files.filter(
    (file) => previousResults.get(file.absolutePath)?.status === 'failed',
  )
  return indexScannedFiles(failedFiles, projectId, deps, { ...options, jobType: 'retry' })
}

function summarizeResults(
  total: number,
  results: readonly IndexingResult[],
  cancelled: boolean,
): IndexDirectorySummary {
  let indexed = 0
  let skipped = 0
  let failed = 0
  for (const result of results) {
    if (result.status === 'indexed') indexed += 1
    else if (result.status === 'skipped') skipped += 1
    else failed += 1
  }
  return {
    total,
    indexed,
    skipped,
    failed,
    pending: total - results.length,
    cancelled,
  }
}
