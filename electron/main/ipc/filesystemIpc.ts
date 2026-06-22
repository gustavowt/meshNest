import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { ScanProgressEvent } from '../../../src/types/electronApi'
import type { ScannedFile } from '../../../src/types/modelFile'
import { ScanCancelledError, scanDirectory } from '../../../src/services/filesystem/directoryScanner'
import { hashFile } from '../../../src/services/filesystem/fileHash'
import { mapWithConcurrency } from '../../../src/services/filesystem/mapWithConcurrency'
import { getSupportedExtension } from '../../../src/services/filesystem/supportedFiles'
import {
  storeDirectoryBookmark,
  withSecurityScopedAccess,
} from '../services/securityScopedBookmarks'

const activeScans = new Map<string, AbortController>()

export function registerFilesystemIpc(): void {
  ipcMain.handle('filesystem:pickDirectory', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    // securityScopedBookmarks is required so the Mac App Store sandbox can
    // regain access to this directory after a restart; it is ignored elsewhere.
    const result = window
      ? await dialog.showOpenDialog(window, {
          properties: ['openDirectory'],
          securityScopedBookmarks: true,
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory'],
          securityScopedBookmarks: true,
        })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    const directory = result.filePaths[0]
    await storeDirectoryBookmark(directory, result.bookmarks?.[0])
    return directory
  })

  ipcMain.handle(
    'filesystem:scanDirectory',
    async (event, directory: string, scanId: string): Promise<ScannedFile[]> => {
      const controller = new AbortController()
      activeScans.set(scanId, controller)
      try {
        return await withSecurityScopedAccess(directory, async () => {
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

          const scanned = await mapWithConcurrency(
            discovered,
            async (file) => ({
              ...file,
              contentHash: await hashFile(file.absolutePath),
            }),
            { signal: controller.signal },
          )
          return scanned
        })
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
    return withSecurityScopedAccess(absolutePath, () => readFile(absolutePath))
  })

  ipcMain.handle(
    'filesystem:scanFile',
    async (_event, absolutePath: string): Promise<ScannedFile> => {
      const extension = getSupportedExtension(absolutePath)
      if (!extension) {
        throw new Error('Only .stl and .3mf files can be scanned')
      }
      return withSecurityScopedAccess(absolutePath, async () => {
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
      })
    },
  )

  ipcMain.handle('filesystem:revealInFolder', async (_event, absolutePath: string) => {
    await withSecurityScopedAccess(absolutePath, async () => {
      shell.showItemInFolder(absolutePath)
    })
  })

  ipcMain.handle(
    'filesystem:openWithSlicer',
    async (_event, absolutePath: string): Promise<void> => {
      const error = await withSecurityScopedAccess(absolutePath, () =>
        shell.openPath(absolutePath),
      )
      if (error) {
        throw new Error(`Failed to open path: ${error}`)
      }
    },
  )
}
