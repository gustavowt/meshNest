import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { ScanProgressEvent } from '../../../src/types/electronApi'
import type { ScannedFile } from '../../../src/types/modelFile'
import { ScanCancelledError, scanDirectory } from '../../../src/services/filesystem/directoryScanner'
import { hashFile } from '../../../src/services/filesystem/fileHash'
import { getSupportedExtension } from '../../../src/services/filesystem/supportedFiles'

const activeScans = new Map<string, AbortController>()

export function registerFilesystemIpc(): void {
  ipcMain.handle('filesystem:pickDirectory', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle(
    'filesystem:scanDirectory',
    async (event, directory: string, scanId: string): Promise<ScannedFile[]> => {
      const controller = new AbortController()
      activeScans.set(scanId, controller)
      try {
        const discovered = await scanDirectory(directory, {
          signal: controller.signal,
          onFile: (file, scannedCount) => {
            const progress: ScanProgressEvent = {
              scanId,
              scannedCount,
              currentPath: file.relativePath,
            }
            event.sender.send('filesystem:scanProgress', progress)
          },
        })

        const scanned: ScannedFile[] = []
        for (const file of discovered) {
          if (controller.signal.aborted) {
            throw new ScanCancelledError()
          }
          scanned.push({ ...file, contentHash: await hashFile(file.absolutePath) })
        }
        return scanned
      } finally {
        activeScans.delete(scanId)
      }
    },
  )

  ipcMain.handle('filesystem:cancelScan', (_event, scanId: string) => {
    activeScans.get(scanId)?.abort()
  })

  ipcMain.handle('filesystem:readModelFile', async (_event, absolutePath: string) => {
    if (!getSupportedExtension(absolutePath)) {
      throw new Error('Only .stl and .3mf files can be read')
    }
    return readFile(absolutePath)
  })

  ipcMain.handle(
    'filesystem:scanFile',
    async (_event, absolutePath: string): Promise<ScannedFile> => {
      const extension = getSupportedExtension(absolutePath)
      if (!extension) {
        throw new Error('Only .stl and .3mf files can be scanned')
      }
      const stats = await stat(absolutePath)
      return {
        absolutePath,
        relativePath: basename(absolutePath),
        filename: basename(absolutePath),
        extension,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        contentHash: await hashFile(absolutePath),
      }
    },
  )

  ipcMain.handle('filesystem:revealInFolder', async (_event, absolutePath: string) => {
    shell.showItemInFolder(absolutePath)
  })
}
