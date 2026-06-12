import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { MeshNestApi, ScanProgressEvent } from '../../src/types/electronApi'

const api: MeshNestApi = {
  pickDirectory: () => ipcRenderer.invoke('filesystem:pickDirectory'),

  scanDirectory: (directory, scanId) =>
    ipcRenderer.invoke('filesystem:scanDirectory', directory, scanId),

  cancelScan: (scanId) => ipcRenderer.invoke('filesystem:cancelScan', scanId),

  readModelFile: (absolutePath) => ipcRenderer.invoke('filesystem:readModelFile', absolutePath),

  saveRenderAssets: (modelFileId, views) =>
    ipcRenderer.invoke('rendering:saveRenderAssets', modelFileId, views),

  upsertModelFile: (file, projectId) => ipcRenderer.invoke('database:upsertModelFile', file, projectId),
  listModelFiles: (projectId) => ipcRenderer.invoke('database:listModelFiles', projectId),
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

  onScanProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, progress: ScanProgressEvent) => callback(progress)
    ipcRenderer.on('filesystem:scanProgress', listener)
    return () => ipcRenderer.removeListener('filesystem:scanProgress', listener)
  },
}

contextBridge.exposeInMainWorld('meshNest', api)
