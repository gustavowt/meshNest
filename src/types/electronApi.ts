import type { ScannedFile } from './modelFile'
import type { ModelRenderAsset, RenderViewName } from './modelRender'

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
  /** Persists rendered views (images + DB records), replacing stale ones. */
  saveRenderAssets(modelFileId: string, views: RenderedViewTransfer[]): Promise<ModelRenderAsset[]>
  /** Subscribes to scan progress events. Returns an unsubscribe function. */
  onScanProgress(callback: (event: ScanProgressEvent) => void): () => void
}

declare global {
  interface Window {
    /** Present only when running inside the Electron shell. */
    meshNest?: MeshNestApi
  }
}
