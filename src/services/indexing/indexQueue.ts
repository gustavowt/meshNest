import type { IndexingProgress, IndexingResult } from '@/types/indexing'

export type ProcessQueueOptions<T> = {
  /** Maximum number of files processed at the same time. */
  concurrency?: number
  /** Abort to stop starting new items; in-flight items finish. */
  signal?: AbortSignal
  onProgress?: (progress: IndexingProgress) => void
  /** Called after an item finishes and its result has been recorded. */
  onItemComplete?: (item: T, result: IndexingResult) => void | Promise<void>
  /** Label used for `currentFile` in progress events. */
  itemLabel?: (item: T) => string
}

export type QueueOutcome = {
  /**
   * One slot per input item, in input order. Slots left undefined belong
   * to items never processed because the run was cancelled.
   */
  results: (IndexingResult | undefined)[]
  /** True when the run stopped early due to cancellation. */
  cancelled: boolean
}

export const DEFAULT_INDEXING_CONCURRENCY = 10

/**
 * Processes items with bounded concurrency, progress events, and
 * cooperative cancellation. Workers are expected to capture their own
 * failures (indexModelFile never throws); unexpected throws are still
 * converted into failed results so the queue always completes.
 */
export async function processIndexQueue<T>(
  items: readonly T[],
  worker: (item: T) => Promise<IndexingResult>,
  options: ProcessQueueOptions<T> = {},
): Promise<QueueOutcome> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_INDEXING_CONCURRENCY)
  const results: (IndexingResult | undefined)[] = new Array(items.length)

  let nextIndex = 0
  let processed = 0
  let indexed = 0
  let skipped = 0
  let failed = 0
  let cancelled = false

  const emitProgress = (current?: T) => {
    options.onProgress?.({
      total: items.length,
      processed,
      indexed,
      skipped,
      failed,
      pending: items.length - processed,
      currentFile: current !== undefined ? options.itemLabel?.(current) : undefined,
    })
  }

  const runWorker = async (): Promise<void> => {
    for (;;) {
      if (options.signal?.aborted) {
        cancelled = true
        return
      }
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) {
        return
      }

      const item = items[index]
      emitProgress(item)

      let result: IndexingResult
      try {
        result = await worker(item)
      } catch (error) {
        result = {
          modelFileId: '',
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        }
      }

      results[index] = result
      processed += 1
      if (result.status === 'indexed') indexed += 1
      else if (result.status === 'skipped') skipped += 1
      else failed += 1
      emitProgress()
      await options.onItemComplete?.(item, result)
    }
  }

  emitProgress()
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  await Promise.all(workers)

  return { results, cancelled }
}
