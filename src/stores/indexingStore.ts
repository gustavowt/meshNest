import { reactive, readonly } from 'vue'
import { indexScannedFiles, retryFailedFiles } from '@/services/indexing/indexDirectory'
import type { IndexDirectorySummary } from '@/services/indexing/indexDirectory'
import { createDesktopIndexingDeps } from '@/services/indexing/desktopIndexingDeps'
import type { IndexingProgress, IndexingResult } from '@/types/indexing'
import type { ScannedFile } from '@/types/modelFile'

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

async function runIndexing(directory: string): Promise<void> {
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
    const files = await window.meshNest.scanDirectory(directory, crypto.randomUUID())
    lastFiles = files
    const outcome = await indexScannedFiles(files, DEFAULT_PROJECT_ID, createDesktopIndexingDeps(), {
      signal: abortController.signal,
      onProgress: (progress) => {
        state.progress = progress
      },
    })
    lastResults = outcome.resultsByPath
    state.summary = outcome.summary
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
  } finally {
    state.running = false
    abortController = null
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
      createDesktopIndexingDeps(),
      {
        signal: abortController.signal,
        onProgress: (progress) => {
          state.progress = progress
        },
      },
    )
    // Merge retry results so another retry only picks still-failing files.
    for (const [path, result] of outcome.resultsByPath) {
      lastResults.set(path, result)
    }
    state.summary = outcome.summary
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
  } finally {
    state.running = false
    abortController = null
  }
}

function cancelIndexing(): void {
  abortController?.abort()
}

function failedCount(): number {
  let count = 0
  for (const result of lastResults.values()) {
    if (result.status === 'failed') count += 1
  }
  return count
}

/** Test-only helper to restore a pristine store between specs. */
export function resetIndexingStore(): void {
  state.running = false
  state.directory = null
  state.progress = null
  state.summary = null
  state.error = null
  abortController = null
  lastFiles = []
  lastResults = new Map()
}

/**
 * Shared indexing run state (module singleton). Owns the scan + queue
 * lifecycle so any page can start, observe, cancel, or retry a run.
 */
export function useIndexingStore() {
  return {
    state: readonly(state),
    runIndexing,
    retryFailed,
    cancelIndexing,
    failedCount,
  }
}
