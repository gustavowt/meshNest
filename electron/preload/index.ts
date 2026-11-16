import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type {
  DirectoryWatchEvent,
  MeshNestApi,
  ScanProgressEvent,
} from '../../src/types/electronApi'

const api: MeshNestApi = {
  isMasBuild: process.mas === true,
  pickDirectory: () => ipcRenderer.invoke('filesystem:pickDirectory'),
  openWithSlicer: (absolutePath) =>
    ipcRenderer.invoke('filesystem:openWithSlicer', absolutePath),

  scanDirectory: (directory, scanId) =>
    ipcRenderer.invoke('filesystem:scanDirectory', directory, scanId),

  cancelScan: (scanId) => ipcRenderer.invoke('filesystem:cancelScan', scanId),

  startDirectoryWatch: (directory, watchId) =>
    ipcRenderer.invoke('filesystem:startDirectoryWatch', directory, watchId),

  stopDirectoryWatch: (watchId) =>
    ipcRenderer.invoke('filesystem:stopDirectoryWatch', watchId),

  readModelFile: (absolutePath) => ipcRenderer.invoke('filesystem:readModelFile', absolutePath),

  scanFile: (absolutePath) => ipcRenderer.invoke('filesystem:scanFile', absolutePath),

  revealInFolder: (absolutePath) => ipcRenderer.invoke('filesystem:revealInFolder', absolutePath),

  saveRenderAssets: (modelFileId, views) =>
    ipcRenderer.invoke('rendering:saveRenderAssets', modelFileId, views),

  readRenderAsset: (absolutePath) => ipcRenderer.invoke('rendering:readRenderAsset', absolutePath),

  upsertModelFile: (file, projectId, options) =>
    ipcRenderer.invoke('database:upsertModelFile', file, projectId, options),
  listModelFiles: (projectId) => ipcRenderer.invoke('database:listModelFiles', projectId),
  listLibraryEntries: (projectId) => ipcRenderer.invoke('database:listLibraryEntries', projectId),
  getLibraryEntry: (modelFileId) => ipcRenderer.invoke('database:getLibraryEntry', modelFileId),
  getModelDetail: (modelFileId) => ipcRenderer.invoke('database:getModelDetail', modelFileId),
  resetToPending: (modelFileId) => ipcRenderer.invoke('database:resetToPending', modelFileId),
  resetAllToPending: (projectId) => ipcRenderer.invoke('database:resetAllToPending', projectId),
  deleteFailedModelFiles: (projectId) =>
    ipcRenderer.invoke('database:deleteFailedModelFiles', projectId),
  resetDatabase: () => ipcRenderer.invoke('database:reset'),
  database: {
    reset: () => ipcRenderer.invoke('database:reset'),
  },
  deleteModel: (modelFileId) => ipcRenderer.invoke('model:deleteModel', modelFileId),
  renameModel: (modelFileId, newName) =>
    ipcRenderer.invoke('model:renameModel', modelFileId, newName),

  searchByEmbedding: (embedding, options) =>
    ipcRenderer.invoke('database:searchByEmbedding', embedding, options),
  countEmbeddings: () => ipcRenderer.invoke('database:countEmbeddings'),

  worldSearch: (query) => ipcRenderer.invoke('world-search:search', query),
  describeImageWorldSearchQuery: (imageBase64Png) =>
    ipcRenderer.invoke('world-search:describeImageQuery', imageBase64Png),
  openWorldSearchSourceUrl: (url) => ipcRenderer.invoke('world-search:openSourceUrl', url),

  getProviderSettings: () => ipcRenderer.invoke('settings:getProviderSettings'),
  saveProviderSettings: (settings) => ipcRenderer.invoke('settings:saveProviderSettings', settings),
  syncProviderSettings: (settings) => ipcRenderer.invoke('settings:syncProviderSettings', settings),
  testVisionProvider: (settings) => ipcRenderer.invoke('settings:testVisionProvider', settings),
  testEmbeddingProvider: (settings) =>
    ipcRenderer.invoke('settings:testEmbeddingProvider', settings),
  isBuiltinEmbeddingAvailable: () =>
    ipcRenderer.invoke('settings:isBuiltinEmbeddingAvailable'),
  testBuiltinEmbedding: () =>
    ipcRenderer.invoke('settings:testBuiltinEmbedding'),
  getOllamaModels: (baseUrl) => ipcRenderer.invoke('settings:getOllamaModels', baseUrl),

  describeModel: (input, settings) => ipcRenderer.invoke('llm:describeModel', input, settings),
  getActiveVisionProvider: () => ipcRenderer.invoke('llm:getActiveVisionProvider'),
  normalizeName: (rawName, context, settings) =>
    ipcRenderer.invoke('llm:normalizeName', rawName, context, settings),
  normalizeNames: (items, settings) => ipcRenderer.invoke('llm:normalizeNames', items, settings),
  embedText: (text, settings) => ipcRenderer.invoke('llm:embedText', text, settings),
  getActiveEmbeddingProvider: () => ipcRenderer.invoke('llm:getActiveEmbeddingProvider'),
  reembedAll: () => ipcRenderer.invoke('llm:reembedAll'),
  storeGeometryMetadata: (modelFileId, metadata) =>
    ipcRenderer.invoke('database:storeGeometryMetadata', modelFileId, metadata),
  storeThreeMfMetadata: (modelFileId, metadata) =>
    ipcRenderer.invoke('database:storeThreeMfMetadata', modelFileId, metadata),
  storeAiDescription: (modelFileId, description, rawResponseJson) =>
    ipcRenderer.invoke('database:storeAiDescription', modelFileId, description, rawResponseJson),
  storeEmbedding: (embedding) => ipcRenderer.invoke('database:storeEmbedding', embedding),
  markIndexed: (modelFileId) => ipcRenderer.invoke('database:markIndexed', modelFileId),
  markFailed: (modelFileId, errorMessage) =>
    ipcRenderer.invoke('database:markFailed', modelFileId, errorMessage),

  createIndexingJob: (job) => ipcRenderer.invoke('database:createIndexingJob', job),
  markIndexingJobRunning: (id) => ipcRenderer.invoke('database:markIndexingJobRunning', id),
  finishIndexingJob: (id, status, modelFileId, errorMessage) =>
    ipcRenderer.invoke('database:finishIndexingJob', id, status, modelFileId, errorMessage),
  listIndexingJobs: (limit) => ipcRenderer.invoke('database:listIndexingJobs', limit),

  onScanProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, progress: ScanProgressEvent) => callback(progress)
    ipcRenderer.on('filesystem:scanProgress', listener)
    return () => ipcRenderer.removeListener('filesystem:scanProgress', listener)
  },

  onDirectoryWatchEvent: (callback) => {
    const listener = (_event: IpcRendererEvent, watchEvent: DirectoryWatchEvent) =>
      callback(watchEvent)
    ipcRenderer.on('filesystem:directoryWatchEvent', listener)
    return () => ipcRenderer.removeListener('filesystem:directoryWatchEvent', listener)
  },
}

contextBridge.exposeInMainWorld('meshNest', api)
