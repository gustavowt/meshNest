import { readFile, stat } from 'node:fs/promises'
import { spawn, exec } from 'node:child_process'
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

  const SLICER_MAP: Record<string, { darwin: string; win32: string[]; linux: string[] }> = {
    bambu: {
      darwin: 'BambuStudio',
      win32: ['BambuStudio.exe'],
      linux: ['bambu-studio', 'BambuStudio'],
    },
    creality: {
      darwin: 'Creality Print',
      win32: ['CrealityPrint.exe', 'Creality Print.exe'],
      linux: ['creality-print', 'CrealityPrint'],
    },
    prusa: {
      darwin: 'PrusaSlicer',
      win32: ['prusa-slicer.exe'],
      linux: ['prusa-slicer', 'PrusaSlicer'],
    },
    orca: {
      darwin: 'OrcaSlicer',
      win32: ['OrcaSlicer.exe'],
      linux: ['orca-slicer', 'OrcaSlicer'],
    },
    cura: {
      darwin: 'UltiMaker Cura',
      win32: ['Cura.exe', 'UltiMaker Cura.exe'],
      linux: ['cura', 'Cura'],
    },
  }

  ipcMain.handle(
    'filesystem:openWithSlicer',
    async (_event, absolutePath: string, slicerId: string): Promise<void> => {
      if (slicerId === 'system') {
        const error = await shell.openPath(absolutePath)
        if (error) {
          throw new Error(`Failed to open path: ${error}`)
        }
        return
      }

      const nameMap: Record<string, string> = {
        bambu: 'Bambu Studio',
        creality: 'Creality Print',
        prusa: 'PrusaSlicer',
        orca: 'OrcaSlicer',
        cura: 'UltiMaker Cura',
      }
      const slicerName = nameMap[slicerId] || slicerId

      const config = SLICER_MAP[slicerId]
      if (!config) {
        throw new Error(`Unknown slicer identifier: ${slicerId}`)
      }

      const platform = process.platform

      if (platform === 'darwin') {
        const child = spawn('open', ['-a', config.darwin, absolutePath], {
          detached: true,
          stdio: 'ignore',
        })
        child.unref()
      } else if (platform === 'win32') {
        const execPromise = (cmd: string) =>
          new Promise<void>((resolve, reject) => {
            exec(cmd, (error) => {
              if (error) reject(error)
              else resolve()
            })
          })

        let launched = false
        for (const exe of config.win32) {
          try {
            const cmd = `start "" "${exe}" "${absolutePath}"`
            await execPromise(cmd)
            launched = true
            break
          } catch {
            // Try next variant
          }
        }

        if (!launched) {
          throw new Error(
            `Failed to open with ${slicerName}. Please ensure it is installed on your system.`
          )
        }
      } else {
        let launched = false
        for (const binary of config.linux) {
          try {
            const child = spawn(binary, [absolutePath], {
              detached: true,
              stdio: 'ignore',
            })
            child.unref()
            launched = true
            break
          } catch {
            // Try next binary
          }
        }

        if (!launched) {
          throw new Error(
            `Failed to open with ${slicerName}. Please ensure it is installed on your system.`
          )
        }
      }
    },
  )
}
