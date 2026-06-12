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

/**
 * Contract of the API exposed by the Electron preload script on
 * `window.meshNest`. UI code must access desktop features only
 * through this bridge.
 */
export type MeshNestApi = {
  /** Opens the OS directory picker. Resolves to null when cancelled. */
  pickDirectory(): Promise<string | null>
  /** Recursively scans a directory and returns hashed model files. */
  scanDirectory(directory: string, scanId: string): Promise<ScannedFile[]>
  /** Cancels a running scan by id. */
  cancelScan(scanId: string): Promise<void>
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
  upsertModelFile(file: ScannedFile, projectId: string): Promise<ModelFile>
  listModelFiles(projectId?: string): Promise<ModelFile[]>
  listLibraryEntries(projectId?: string): Promise<LibraryEntry[]>
  getModelDetail(modelFileId: string): Promise<ModelDetail | null>
  /** Forces a file back to 'pending' so the next run reindexes it. */
  resetToPending(modelFileId: string): Promise<void>

  // Semantic search.
  searchByEmbedding(
    embedding: number[],
    options?: { limit?: number; projectId?: string },
  ): Promise<SearchResult[]>
  countEmbeddings(): Promise<number>

  // Provider settings.
  getProviderSettings(): Promise<ProviderSettings>
  saveProviderSettings(settings: ProviderSettings): Promise<{ embeddingsCleared: boolean }>
  testVisionProvider(settings: VisionSettings): Promise<ProviderTestResult>
  testEmbeddingProvider(settings: EmbeddingSettings): Promise<ProviderTestResult>

  // LLM calls (run in main with the configured provider).
  describeModel(input: VisionAnalysisInput): Promise<VisionProviderResult>
  getActiveVisionProvider(): Promise<{ name: string; model: string }>
  embedText(text: string): Promise<number[]>
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
}

declare global {
  interface Window {
    /** Present only when running inside the Electron shell. */
    meshNest?: MeshNestApi
  }
}
