import type { IndexingJobTracker } from './indexDirectory'
import type { IndexingBackend } from './indexingBackend'

/**
 * Production IndexingBackend: forwards every persistence operation to
 * the Electron main process through the preload bridge.
 */
export function createBridgeIndexingBackend(): IndexingBackend {
  const bridge = window.meshNest
  if (!bridge) {
    throw new Error('Indexing requires the desktop app')
  }
  return {
    upsertModelFile: (file, projectId) => bridge.upsertModelFile(file, projectId),
    readModelFile: (absolutePath) => bridge.readModelFile(absolutePath),
    storeGeometryMetadata: (modelFileId, metadata) =>
      bridge.storeGeometryMetadata(modelFileId, metadata),
    storeThreeMfMetadata: (modelFileId, metadata) =>
      bridge.storeThreeMfMetadata(modelFileId, metadata),
    saveRenderAssets: (modelFileId, views) => bridge.saveRenderAssets(modelFileId, views),
    storeAiDescription: (modelFileId, description, rawResponseJson) =>
      bridge.storeAiDescription(modelFileId, description, rawResponseJson),
    storeEmbedding: (embedding) => bridge.storeEmbedding(embedding),
    markIndexed: (modelFileId) => bridge.markIndexed(modelFileId),
    markFailed: (modelFileId, errorMessage) => bridge.markFailed(modelFileId, errorMessage),
  }
}

/**
 * Production IndexingJobTracker: persists queue history in the main
 * process database through the preload bridge.
 */
export function createBridgeJobTracker(): IndexingJobTracker {
  const bridge = window.meshNest
  if (!bridge) {
    throw new Error('Indexing requires the desktop app')
  }
  return {
    createJob: (job) => bridge.createIndexingJob(job),
    markJobRunning: (id) => bridge.markIndexingJobRunning(id),
    finishJob: (id, status, modelFileId, errorMessage) =>
      bridge.finishIndexingJob(id, status, modelFileId, errorMessage),
  }
}
