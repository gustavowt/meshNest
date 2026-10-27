import type { IndexingJob, IndexingJobType } from './indexing'
import type { LibraryEntry } from './library'
import type { AIModelDescription, ModelEmbedding } from './llm'
import type { ModelFile, ScannedFile } from './modelFile'
import type { ModelDetail } from './modelDetail'
import type { GeometryMetadata, ThreeMfPackageMetadata } from './modelMetadata'
import type { ModelRenderAsset, RenderViewName } from './modelRender'
import type {
  EmbeddingSettings,
  ProviderSettings,
  ProviderTestResult,
  VisionSettings,
} from './providerSettings'
import type { SearchResult } from './search'
import type {
  ImageSearchQuery,
  WorldSearchQuery,
  WorldSearchResponse,
} from './worldSearch'
import type {
  NameNormalizationInput,
  NameNormalizationResult,
  VisionAnalysisInput,
  VisionProviderResult,
} from '@/services/llm/visionProvider'

export type RenderedViewTransfer = {
  viewName: RenderViewName
  png: Uint8Array
  width: number
  height: number
}

export type ScanProgressEvent = {
  scanId: string
  /** Number of supported files found so far. */
  scannedCount: number
  /** Relative path of the most recently found file. */
  currentPath: string
}

export type DirectoryWatchEvent = {
  watchId: string
  absolutePath: string
  relativePath: string
  filename: string
  extension: ModelFile['extension']
}

/**
 * Contract of the API exposed by the Electron preload script on
 * `window.meshNest`. UI code must access desktop features only
 * through this bridge.
 */
export type MeshNestApi = {
  /** True when running as a sandboxed Mac App Store build. */
  readonly isMasBuild: boolean
  /** Opens the OS directory picker. Resolves to null when cancelled. */
  pickDirectory(): Promise<string | null>
  /** Opens the specified 3D model file with the OS default program. */
  openWithSlicer(absolutePath: string): Promise<void>
  /** Recursively scans a directory and returns hashed model files. */
  scanDirectory(directory: string, scanId: string): Promise<ScannedFile[]>
  /** Cancels a running scan by id. */
  cancelScan(scanId: string): Promise<void>
  /** Starts watching a directory tree for newly-added supported model files. */
  startDirectoryWatch(directory: string, watchId: string): Promise<void>
  /** Stops a previously started directory watcher. */
  stopDirectoryWatch(watchId: string): Promise<void>
  /** Reads the raw bytes of a supported model file. */
  readModelFile(absolutePath: string): Promise<Uint8Array>
  /** Stats and hashes a single supported model file. */
  scanFile(absolutePath: string): Promise<ScannedFile>
  /** Reveals the file in the OS file manager (Finder/Explorer). */
  revealInFolder(absolutePath: string): Promise<void>
  /** Persists rendered views (images + DB records), replacing stale ones. */
  saveRenderAssets(modelFileId: string, views: RenderedViewTransfer[]): Promise<ModelRenderAsset[]>
  /** Reads a stored render PNG. The path must be inside the renders folder. */
  readRenderAsset(absolutePath: string): Promise<Uint8Array>

  // Database operations (executed in the main process).
  upsertModelFile(
    file: ScannedFile,
    projectId: string,
    options?: { relocateByHash?: boolean },
  ): Promise<ModelFile>
  listModelFiles(projectId?: string): Promise<ModelFile[]>
  listLibraryEntries(projectId?: string): Promise<LibraryEntry[]>
  getLibraryEntry(modelFileId: string): Promise<LibraryEntry | null>
  getModelDetail(modelFileId: string): Promise<ModelDetail | null>
  /** Forces a file back to 'pending' so the next run reindexes it. */
  resetToPending(modelFileId: string): Promise<void>
  /** Forces every file (optionally scoped to a project) back to 'pending' for a full re-index. */
  resetAllToPending(projectId?: string): Promise<void>
  /** Removes failed database records without deleting source files. */
  deleteFailedModelFiles(projectId?: string): Promise<number>
  /** Moves the model file to the OS trash and removes all of its records. */
  deleteModel(modelFileId: string): Promise<void>
  /** Renames the model file on disk (same folder) and updates its records. */
  renameModel(modelFileId: string, newName: string): Promise<ModelFile>

  // Semantic search.
  searchByEmbedding(
    embedding: number[],
    options?: { limit?: number; projectId?: string; queryText?: string },
  ): Promise<SearchResult[]>
  countEmbeddings(): Promise<number>

  // Worldwide 3D model search (external repositories).
  worldSearch(query: WorldSearchQuery): Promise<WorldSearchResponse>
  describeImageWorldSearchQuery(imageBase64Png: string): Promise<ImageSearchQuery>
  openWorldSearchSourceUrl(url: string): Promise<void>

  // Provider settings.
  getProviderSettings(): Promise<ProviderSettings>
  saveProviderSettings(settings: ProviderSettings): Promise<{ embeddingsCleared: boolean }>
  syncProviderSettings(settings: ProviderSettings): Promise<void>
  testVisionProvider(settings: VisionSettings): Promise<ProviderTestResult>
  testEmbeddingProvider(settings: EmbeddingSettings): Promise<ProviderTestResult>
  isBuiltinEmbeddingAvailable(): Promise<boolean>
  testBuiltinEmbedding(): Promise<{ ok: boolean; reason?: string }>
  getOllamaModels(baseUrl: string): Promise<string[]>

  // LLM calls (run in main with the configured provider).
  describeModel(input: VisionAnalysisInput, settings?: VisionSettings): Promise<VisionProviderResult>
  getActiveVisionProvider(): Promise<{ name: string; model: string }>
  /** Normalizes a raw file name into a clean title via the active vision LLM. */
  normalizeName(rawName: string, context?: string, settings?: VisionSettings): Promise<string>
  /** Normalizes several file names in one active vision LLM call. */
  normalizeNames(items: NameNormalizationInput[], settings?: VisionSettings): Promise<NameNormalizationResult[]>
  embedText(text: string, settings?: EmbeddingSettings): Promise<number[]>
  getActiveEmbeddingProvider(): Promise<{ name: string; model: string; dimensions: number }>
  reembedAll(): Promise<{ embedded: number; failed: number; errorMessage?: string }>
  storeGeometryMetadata(modelFileId: string, metadata: GeometryMetadata): Promise<void>
  storeThreeMfMetadata(modelFileId: string, metadata: ThreeMfPackageMetadata): Promise<void>
  storeAiDescription(
    modelFileId: string,
    description: AIModelDescription,
    rawResponseJson: string,
  ): Promise<void>
  storeEmbedding(embedding: Omit<ModelEmbedding, 'createdAt'>): Promise<void>
  markIndexed(modelFileId: string): Promise<void>
  markFailed(modelFileId: string, errorMessage: string): Promise<void>

  // Indexing job persistence (queue history).
  createIndexingJob(job: { id: string; absolutePath: string; jobType: IndexingJobType }): Promise<void>
  markIndexingJobRunning(id: string): Promise<void>
  finishIndexingJob(
    id: string,
    status: 'succeeded' | 'failed' | 'cancelled',
    modelFileId?: string,
    errorMessage?: string,
  ): Promise<void>
  listIndexingJobs(limit?: number): Promise<IndexingJob[]>
  /** Subscribes to scan progress events. Returns an unsubscribe function. */
  onScanProgress(callback: (event: ScanProgressEvent) => void): () => void
  /** Subscribes to directory watcher events. Returns an unsubscribe function. */
  onDirectoryWatchEvent(callback: (event: DirectoryWatchEvent) => void): () => void
}

declare global {
  interface Window {
    /** Present only when running inside the Electron shell. */
    meshNest?: MeshNestApi
  }
}
