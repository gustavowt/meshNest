import { ScanCancelledError } from './directoryScanner'

export type MapWithConcurrencyOptions = {
  concurrency?: number
  signal?: AbortSignal
}

/** Default parallelism for filesystem-heavy work (hashing, stat batches). */
export const DEFAULT_FILESYSTEM_CONCURRENCY = 8

/**
 * Maps items with bounded concurrency while preserving input order in the
 * returned array. Cooperative cancellation via AbortSignal.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R>,
  options: MapWithConcurrencyOptions = {},
): Promise<R[]> {
  if (items.length === 0) {
    return []
  }

  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_FILESYSTEM_CONCURRENCY)
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  const runWorker = async (): Promise<void> => {
    for (;;) {
      if (options.signal?.aborted) {
        throw new ScanCancelledError()
      }

      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) {
        return
      }

      results[index] = await mapper(items[index], index)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  await Promise.all(workers)
  return results
}
