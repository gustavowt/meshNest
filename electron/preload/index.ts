import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { MeshNestApi, ScanProgressEvent } from '../../src/types/electronApi'

const api: MeshNestApi = {
  pickDirectory: () => ipcRenderer.invoke('filesystem:pickDirectory'),

  scanDirectory: (directory, scanId) =>
    ipcRenderer.invoke('filesystem:scanDirectory', directory, scanId),

  cancelScan: (scanId) => ipcRenderer.invoke('filesystem:cancelScan', scanId),

  readModelFile: (absolutePath) => ipcRenderer.invoke('filesystem:readModelFile', absolutePath),

  scanFile: (absolutePath) => ipcRenderer.invoke('filesystem:scanFile', absolutePath),

  revealInFolder: (absolutePath) => ipcRenderer.invoke('filesystem:revealInFolder', absolutePath),

  saveRenderAssets: (modelFileId, views) =>
    ipcRenderer.invoke('rendering:saveRenderAssets', modelFileId, views),

  readRenderAsset: (absolutePath) => ipcRenderer.invoke('rendering:readRenderAsset', absolutePath),

  upsertModelFile: (file, projectId) => ipcRenderer.invoke('database:upsertModelFile', file, projectId),
  listModelFiles: (projectId) => ipcRenderer.invoke('database:listModelFiles', projectId),
  listLibraryEntries: (projectId) => ipcRenderer.invoke('database:listLibraryEntries', projectId),
  getModelDetail: (modelFileId) => ipcRenderer.invoke('database:getModelDetail', modelFileId),
  resetToPending: (modelFileId) => ipcRenderer.invoke('database:resetToPending', modelFileId),

  searchByEmbedding: (embedding, options) =>
    ipcRenderer.invoke('database:searchByEmbedding', embedding, options),
  countEmbeddings: () => ipcRenderer.invoke('database:countEmbeddings'),

  getProviderSettings: () => ipcRenderer.invoke('settings:getProviderSettings'),
  saveProviderSettings: (settings) => ipcRenderer.invoke('settings:saveProviderSettings', settings),
  testVisionProvider: (settings) => ipcRenderer.invoke('settings:testVisionProvider', settings),
  testEmbeddingProvider: (settings) =>
    ipcRenderer.invoke('settings:testEmbeddingProvider', settings),
  getOllamaModels: (baseUrl) => ipcRenderer.invoke('settings:getOllamaModels', baseUrl),

  describeModel: (input) => ipcRenderer.invoke('llm:describeModel', input),
  getActiveVisionProvider: () => ipcRenderer.invoke('llm:getActiveVisionProvider'),
  embedText: (text) => ipcRenderer.invoke('llm:embedText', text),
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
}

contextBridge.exposeInMainWorld('meshNest', api)
