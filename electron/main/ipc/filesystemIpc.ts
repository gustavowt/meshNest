import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { DirectoryWatchEvent, ScanProgressEvent } from '../../../src/types/electronApi'
import type { ScannedFile } from '../../../src/types/modelFile'
import { scanDirectory } from '../../../src/services/filesystem/directoryScanner'
import { hashFile } from '../../../src/services/filesystem/fileHash'
import { mapWithConcurrency } from '../../../src/services/filesystem/mapWithConcurrency'
import {
  DEFAULT_IGNORED_DIRECTORIES,
  getSupportedExtension,
  isHiddenName,
} from '../../../src/services/filesystem/supportedFiles'
import {
  startSecurityScopedAccess,
  storeDirectoryBookmark,
  withSecurityScopedAccess,
} from '../services/securityScopedBookmarks'

const activeScans = new Map<string, AbortController>()
const activeDirectoryWatches = new Map<string, DirectoryWatch>()
const WATCH_DEBOUNCE_MS = 700
const FILE_STABILITY_POLL_MS = 700
const FILE_STABILITY_TIMEOUT_MS = 5 * 60 * 1000

type DirectoryWatch = {
  directory: string
  sender: Electron.WebContents
  watcher: FSWatcher
  pendingTimers: Map<string, NodeJS.Timeout>
  stopSecurityAccess: () => void
}

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

  ipcMain.handle(
    'filesystem:startDirectoryWatch',
    async (event, directory: string, watchId: string): Promise<void> => {
      stopDirectoryWatch(watchId)
      const resolvedDirectory = path.resolve(directory)
      const stopSecurityAccess = await startSecurityScopedAccess(resolvedDirectory)

      try {
        const watcher = createDirectoryWatcher(resolvedDirectory, (filename) => {
          if (!filename) {
            return
          }
          const absolutePath = path.resolve(resolvedDirectory, filename.toString())
          scheduleDirectoryWatchEvent(watchId, absolutePath)
        })

        const directoryWatch: DirectoryWatch = {
          directory: resolvedDirectory,
          sender: event.sender,
          watcher,
          pendingTimers: new Map(),
          stopSecurityAccess,
        }
        activeDirectoryWatches.set(watchId, directoryWatch)
        event.sender.once('destroyed', () => stopDirectoryWatch(watchId))
      } catch (error) {
        stopSecurityAccess()
        throw error
      }
    },
  )

  ipcMain.handle('filesystem:stopDirectoryWatch', (_event, watchId: string): void => {
    stopDirectoryWatch(watchId)
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
          relativePath: path.basename(absolutePath),
          filename: path.basename(absolutePath),
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

function createDirectoryWatcher(
  directory: string,
  onPossibleFile: (filename: string | Buffer | null) => void,
): FSWatcher {
  try {
    return watch(directory, { recursive: true }, (_eventType, filename) => onPossibleFile(filename))
  } catch {
    return watch(directory, (_eventType, filename) => onPossibleFile(filename))
  }
}

function stopDirectoryWatch(watchId: string): void {
  const directoryWatch = activeDirectoryWatches.get(watchId)
  if (!directoryWatch) {
    return
  }
  activeDirectoryWatches.delete(watchId)
  for (const timer of directoryWatch.pendingTimers.values()) {
    clearTimeout(timer)
  }
  directoryWatch.pendingTimers.clear()
  directoryWatch.watcher.close()
  directoryWatch.stopSecurityAccess()
}

function scheduleDirectoryWatchEvent(watchId: string, absolutePath: string): void {
  const directoryWatch = activeDirectoryWatches.get(watchId)
  if (!directoryWatch) {
    return
  }
  const relativePath = path.relative(directoryWatch.directory, absolutePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return
  }
  if (!shouldReportWatchedPath(relativePath)) {
    return
  }

  const existingTimer = directoryWatch.pendingTimers.get(absolutePath)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  const timer = setTimeout(async () => {
    directoryWatch.pendingTimers.delete(absolutePath)
    if (!activeDirectoryWatches.has(watchId)) {
      return
    }
    const stable = await waitForStableModelFile(absolutePath)
    const activeWatch = activeDirectoryWatches.get(watchId)
    if (!stable || !activeWatch) {
      return
    }
    const extension = getSupportedExtension(absolutePath)
    if (!extension) {
      return
    }
    const event: DirectoryWatchEvent = {
      watchId,
      absolutePath,
      relativePath,
      filename: path.basename(absolutePath),
      extension,
    }
    activeWatch.sender.send('filesystem:directoryWatchEvent', event)
  }, WATCH_DEBOUNCE_MS)
  directoryWatch.pendingTimers.set(absolutePath, timer)
}

function shouldReportWatchedPath(relativePath: string): boolean {
  const parts = relativePath.split(/[\\/]+/).filter(Boolean)
  if (parts.length === 0) {
    return false
  }
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    if (isHiddenName(part)) {
      return false
    }
    if (index < parts.length - 1 && DEFAULT_IGNORED_DIRECTORIES.has(part.toLowerCase())) {
      return false
    }
  }
  return Boolean(getSupportedExtension(parts[parts.length - 1]))
}

async function waitForStableModelFile(absolutePath: string): Promise<boolean> {
  const startedAt = Date.now()
  let previous: { size: number; mtimeMs: number } | null = null

  while (Date.now() - startedAt < FILE_STABILITY_TIMEOUT_MS) {
    try {
      const stats = await withSecurityScopedAccess(absolutePath, () => stat(absolutePath))
      if (!stats.isFile()) {
        return false
      }
      const current = { size: stats.size, mtimeMs: stats.mtimeMs }
      if (previous && previous.size === current.size && previous.mtimeMs === current.mtimeMs) {
        return true
      }
      previous = current
    } catch {
      return false
    }

    await new Promise((resolve) => setTimeout(resolve, FILE_STABILITY_POLL_MS))
  }

  return false
}
