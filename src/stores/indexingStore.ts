import { reactive } from 'vue'
import { indexScannedFiles, retryFailedFiles } from '@/services/indexing/indexDirectory'
import type { LibraryEntry } from '@/types/library'
import type { IndexDirectorySummary } from '@/services/indexing/indexDirectory'
import { createDesktopIndexingDeps } from '@/services/indexing/desktopIndexingDeps'
import type { IndexingProgress, IndexingResult } from '@/types/indexing'
import type { ModelFile, ScannedFile } from '@/types/modelFile'
import type { DirectoryWatchEvent } from '@/types/electronApi'

const DEFAULT_PROJECT_ID = 'default'

type IndexingState = {
  running: boolean
  /** Directory currently (or last) being indexed. */
  directory: string | null
  progress: IndexingProgress | null
  summary: IndexDirectorySummary | null
  error: string | null
}

const state = reactive<IndexingState>({
  running: false,
  directory: null,
  progress: null,
  summary: null,
  error: null,
})

let abortController: AbortController | null = null
let lastFiles: ScannedFile[] = []
let lastResults: Map<string, IndexingResult> = new Map()
let isBootScanning = false
let watchedFileProcessing = false
const watchedFileQueue = new Map<string, DirectoryWatchEvent>()
const fileProcessedListeners = new Set<(file: ScannedFile, result: IndexingResult) => void>()
const watchedFileIndexedListeners = new Set<(result: IndexingResult) => void>()
let activeManualRunPaths = new Set<string>()
const recentlyHandledWatchPaths = new Map<string, number>()
const WATCH_EVENT_IGNORE_MS = 10_000

/**
 * Runs a directory indexing pass. With `{ force: true }` every existing
 * record is first reset to 'pending' so the whole library is reprocessed
 * (re-render + re-AI) even when no file changed and nothing failed.
 */
async function runIndexing(
  directory: string,
  options: { force?: boolean } = {},
): Promise<void> {
  if (state.running || !window.meshNest) {
    return
  }
  state.running = true
  state.directory = directory
  state.progress = null
  state.summary = null
  state.error = null
  abortController = new AbortController()

  try {
    if (options.force) {
      await window.meshNest.resetAllToPending(DEFAULT_PROJECT_ID)
    }
    const files = await reconcileScannedDirectory(directory)
    lastFiles = files
    rememberManualRunFiles(files)
    const outcome = await indexScannedFiles(files, DEFAULT_PROJECT_ID, await createDesktopIndexingDeps(), {
      signal: abortController.signal,
      onProgress: (progress) => {
        state.progress = progress
      },
      onFileComplete: notifyFileProcessed,
    })
    lastResults = outcome.resultsByPath
    state.summary = outcome.summary
  } catch (error) {
    state.error = formatIndexingError(error)
  } finally {
    finishManualRunWatchSuppression()
    state.running = false
    abortController = null
    void processWatchedFileQueue()
  }
}

/**
 * On startup, catch files added while the app was closed. This keeps the
 * watcher path focused on live additions while preserving the same queue.
 */
async function indexNewFilesOnBoot(
  directory?: string | null,
): Promise<{ total: number; successful: number; failed: number }> {
  if (state.running || !directory || !window.meshNest) {
    return { total: 0, successful: 0, failed: 0 }
  }

  isBootScanning = true

  try {
    const scannedFiles = await window.meshNest.scanDirectory(directory, crypto.randomUUID())
    rememberManualRunFiles(scannedFiles)
    const existingFiles = await window.meshNest.listModelFiles(DEFAULT_PROJECT_ID)
    const existingPaths = new Set(existingFiles.map((file) => file.absolutePath))
    const newFiles = scannedFiles.filter((file) => !existingPaths.has(file.absolutePath))

    if (newFiles.length === 0) {
      return { total: 0, successful: 0, failed: 0 }
    }

    state.running = true
    state.directory = directory
    state.progress = null
    state.summary = null
    state.error = null
    abortController = new AbortController()

    lastFiles = newFiles
    const outcome = await indexScannedFiles(newFiles, DEFAULT_PROJECT_ID, await createDesktopIndexingDeps(), {
      signal: abortController.signal,
      onProgress: (progress) => {
        state.progress = progress
      },
      onFileComplete: notifyFileProcessed,
    })
    lastResults = outcome.resultsByPath
    state.summary = outcome.summary
    return {
      total: outcome.summary.total,
      successful: outcome.summary.indexed,
      failed: outcome.summary.failed,
    }
  } catch (error) {
    state.error = formatIndexingError(error)
    return { total: 0, successful: 0, failed: 0 }
  } finally {
    isBootScanning = false
    finishManualRunWatchSuppression()
    state.running = false
    abortController = null
    void processWatchedFileQueue()
  }
}

async function retryFailed(): Promise<void> {
  if (state.running || lastFiles.length === 0) {
    return
  }
  state.running = true
  state.progress = null
  state.error = null
  abortController = new AbortController()

  try {
    const outcome = await retryFailedFiles(
      lastFiles,
      lastResults,
      DEFAULT_PROJECT_ID,
      await createDesktopIndexingDeps(),
      {
        signal: abortController.signal,
        onProgress: (progress) => {
          state.progress = progress
        },
        onFileComplete: notifyFileProcessed,
      },
    )
    // Merge retry results so another retry only picks still-failing files.
    for (const [path, result] of outcome.resultsByPath) {
      lastResults.set(path, result)
    }
    state.summary = outcome.summary
  } catch (error) {
    state.error = formatIndexingError(error)
  } finally {
    state.running = false
    abortController = null
    void processWatchedFileQueue()
  }
}

/**
 * Re-scans and re-indexes models that are marked failed in the library.
 * Reconciles paths from disk first so renamed/moved files are found.
 */
async function retryFailedLibrary(
  failedEntries: readonly Pick<LibraryEntry, 'id' | 'absolutePath'>[],
  libraryFolder?: string,
): Promise<void> {
  if (state.running || !window.meshNest || failedEntries.length === 0) {
    return
  }
  state.running = true
  state.progress = null
  state.error = null
  abortController = new AbortController()

  try {
    const deps = await createDesktopIndexingDeps()
    const entries = [...failedEntries]

    if (libraryFolder) {
      const files = await reconcileScannedDirectory(libraryFolder)
      lastFiles = files
      rememberManualRunFiles(files)
      const outcome = await indexScannedFiles(files, DEFAULT_PROJECT_ID, deps, {
        signal: abortController.signal,
        jobType: 'retry',
        onProgress: (progress) => {
          state.progress = progress
        },
        onFileComplete: notifyFileProcessed,
      })
      lastResults = outcome.resultsByPath
      state.summary = outcome.summary
      return
    }

    if (entries.length === 0) {
      lastResults = new Map()
      state.summary = summarizeRetryResults(0, [])
      return
    }

    const files: ScannedFile[] = []
    const resultsByPath = new Map<string, IndexingResult>()

    for (const entry of entries) {
      try {
        files.push(await window.meshNest.scanFile(entry.absolutePath))
      } catch (error) {
        const errorMessage = formatScanFileError(error, entry.absolutePath)
        await deps.backend.markFailed(entry.id, errorMessage)
        resultsByPath.set(entry.absolutePath, {
          modelFileId: entry.id,
          status: 'failed',
          errorMessage,
        })
      }
    }

    lastFiles = files

    if (files.length > 0) {
      const outcome = await indexScannedFiles(files, DEFAULT_PROJECT_ID, deps, {
        signal: abortController.signal,
        jobType: 'retry',
        onProgress: (progress) => {
          state.progress = progress
        },
        onFileComplete: notifyFileProcessed,
      })
      for (const [path, result] of outcome.resultsByPath) {
        resultsByPath.set(path, result)
      }
    }

    lastResults = resultsByPath
    state.summary = summarizeRetryResults(entries.length, [...resultsByPath.values()])
  } catch (error) {
    state.error = formatIndexingError(error)
  } finally {
    finishManualRunWatchSuppression()
    state.running = false
    abortController = null
    void processWatchedFileQueue()
  }
}

async function reconcileScannedDirectory(directory: string): Promise<ScannedFile[]> {
  if (!window.meshNest) {
    return []
  }
  const files = await window.meshNest.scanDirectory(directory, crypto.randomUUID())
  await window.meshNest.deleteFailedModelFiles(DEFAULT_PROJECT_ID)
  for (const file of files) {
    await window.meshNest.upsertModelFile(file, DEFAULT_PROJECT_ID, { relocateByHash: false })
  }
  return files
}

function formatScanFileError(error: unknown, absolutePath: string): string {
  const reason = error instanceof Error ? error.message : String(error)
  if (
    reason.includes('dlopen') ||
    reason.includes('onnxruntime') ||
    reason.includes('to_chars') ||
    reason.includes('libc++')
  ) {
    return 'Embedding provider unavailable — configure Ollama or an API provider in Settings.'
  }
  if (reason.includes('ENOENT') || reason.toLowerCase().includes('no such file')) {
    return `File not found at ${absolutePath}. It may have been moved or deleted.`
  }
  return reason
}

function formatIndexingError(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error)
  if (
    reason.includes('dlopen') ||
    reason.includes('onnxruntime') ||
    reason.includes('to_chars') ||
    reason.includes('libc++')
  ) {
    return 'Embedding provider unavailable — configure Ollama or an API provider in Settings.'
  }
  return reason
}

function summarizeRetryResults(
  total: number,
  results: readonly IndexingResult[],
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
    pending: Math.max(0, total - results.length),
    cancelled: false,
  }
}

function cancelIndexing(): void {
  abortController?.abort()
}

function queueWatchedFile(event: DirectoryWatchEvent): void {
  if (shouldIgnoreWatchedFile(event.absolutePath)) {
    return
  }
  watchedFileQueue.set(event.absolutePath, event)
  void processWatchedFileQueue()
}

function rememberManualRunFiles(files: readonly ScannedFile[]): void {
  activeManualRunPaths = new Set(files.map((file) => file.absolutePath))
  ignoreWatchedPaths(activeManualRunPaths)
  for (const absolutePath of activeManualRunPaths) {
    watchedFileQueue.delete(absolutePath)
  }
}

function finishManualRunWatchSuppression(): void {
  if (activeManualRunPaths.size > 0) {
    ignoreWatchedPaths(activeManualRunPaths)
    activeManualRunPaths = new Set()
  }
  pruneExpiredWatchIgnores()
}

function ignoreWatchedPaths(paths: Iterable<string>): void {
  const until = Date.now() + WATCH_EVENT_IGNORE_MS
  for (const path of paths) {
    recentlyHandledWatchPaths.set(path, until)
  }
}

function shouldIgnoreWatchedFile(absolutePath: string): boolean {
  pruneExpiredWatchIgnores()
  return activeManualRunPaths.has(absolutePath) || recentlyHandledWatchPaths.has(absolutePath)
}

function pruneExpiredWatchIgnores(): void {
  const now = Date.now()
  for (const [path, until] of recentlyHandledWatchPaths) {
    if (until <= now) {
      recentlyHandledWatchPaths.delete(path)
    }
  }
}

function onWatchedFileIndexed(callback: (result: IndexingResult) => void): () => void {
  watchedFileIndexedListeners.add(callback)
  return () => watchedFileIndexedListeners.delete(callback)
}

function onFileProcessed(callback: (file: ScannedFile, result: IndexingResult) => void): () => void {
  fileProcessedListeners.add(callback)
  return () => fileProcessedListeners.delete(callback)
}

function notifyFileProcessed(file: ScannedFile, result: IndexingResult): void {
  for (const listener of fileProcessedListeners) {
    listener(file, result)
  }
}

async function processWatchedFileQueue(): Promise<void> {
  if (watchedFileProcessing || state.running || isBootScanning || !window.meshNest) {
    return
  }
  watchedFileProcessing = true
  try {
    while (!state.running && !isBootScanning && watchedFileQueue.size > 0 && window.meshNest) {
      const next = watchedFileQueue.entries().next().value as
        | [string, DirectoryWatchEvent]
        | undefined
      if (!next) {
        return
      }
      const [absolutePath, event] = next
      watchedFileQueue.delete(absolutePath)
      await indexWatchedFile(event)
    }
  } finally {
    watchedFileProcessing = false
  }
}

async function indexWatchedFile(event: DirectoryWatchEvent): Promise<void> {
  if (!window.meshNest) {
    return
  }
  ignoreWatchedPaths([event.absolutePath])
  watchedFileQueue.delete(event.absolutePath)
  state.running = true
  state.directory = event.relativePath
  state.progress = null
  state.summary = null
  state.error = null
  abortController = new AbortController()

  try {
    const scanned = await window.meshNest.scanFile(event.absolutePath)
    const file: ScannedFile = {
      ...scanned,
      relativePath: event.relativePath,
      filename: event.filename,
      extension: event.extension,
    }
    lastFiles = [file]
    const outcome = await indexScannedFiles([file], DEFAULT_PROJECT_ID, await createDesktopIndexingDeps(), {
      signal: abortController.signal,
      onProgress: (progress) => {
        state.progress = progress
      },
      onFileComplete: notifyFileProcessed,
    })
    lastResults = outcome.resultsByPath
    state.summary = outcome.summary
    const result = outcome.resultsByPath.get(file.absolutePath)
    if (result?.modelFileId) {
      for (const listener of watchedFileIndexedListeners) {
        listener(result)
      }
    }
  } catch (error) {
    state.error = formatIndexingError(error)
  } finally {
    ignoreWatchedPaths([event.absolutePath])
    state.running = false
    abortController = null
  }
}

function failedCount(): number {
  let count = 0
  for (const result of lastResults.values()) {
    if (result.status === 'failed') count += 1
  }
  return count
}

/**
 * Keeps in-memory scan/retry caches aligned after an in-app rename so later
 * retries do not target the previous absolute path.
 */
function syncRenamedModel(previousAbsolutePath: string, updated: ModelFile): void {
  lastFiles = lastFiles.map((file) =>
    file.absolutePath === previousAbsolutePath
      ? {
          ...file,
          absolutePath: updated.absolutePath,
          relativePath: updated.relativePath,
          filename: updated.filename,
        }
      : file,
  )

  const previousResult = lastResults.get(previousAbsolutePath)
  if (previousResult) {
    lastResults.delete(previousAbsolutePath)
    lastResults.set(updated.absolutePath, previousResult)
  }
}

/** Test-only helper to restore a pristine store between specs. */
export function resetIndexingStore(): void {
  isBootScanning = false
  state.running = false
  state.directory = null
  state.progress = null
  state.summary = null
  state.error = null
  abortController = null
  lastFiles = []
  lastResults = new Map()
  watchedFileProcessing = false
  watchedFileQueue.clear()
  fileProcessedListeners.clear()
  watchedFileIndexedListeners.clear()
  activeManualRunPaths = new Set()
  recentlyHandledWatchPaths.clear()
}

/**
 * Shared indexing run state (module singleton). Owns the scan + queue
 * lifecycle so any page can start, observe, cancel, or retry a run.
 */
export function useIndexingStore() {
  return {
    state,
    runIndexing,
    retryFailed,
    retryFailedLibrary,
    indexNewFilesOnBoot,
    cancelIndexing,
    queueWatchedFile,
    onFileProcessed,
    onWatchedFileIndexed,
    failedCount,
    syncRenamedModel,
  }
}
