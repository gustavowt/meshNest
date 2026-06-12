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

  onScanProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, progress: ScanProgressEvent) => callback(progress)
    ipcRenderer.on('filesystem:scanProgress', listener)
    return () => ipcRenderer.removeListener('filesystem:scanProgress', listener)
  },
}

contextBridge.exposeInMainWorld('meshNest', api)
