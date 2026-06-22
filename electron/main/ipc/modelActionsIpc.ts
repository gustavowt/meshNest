import { rename } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { ipcMain, shell } from 'electron'
import { AiDescriptionRepository } from '../../../src/services/database/aiDescriptionRepository'
import { ModelFileRepository } from '../../../src/services/database/modelFileRepository'
import { RenderAssetStorage } from '../../../src/services/rendering/renderAssetStorage'
import type { ModelFile } from '../../../src/types/modelFile'
import { getModelRendersRoot } from '../services/appDataPaths'
import { getDatabaseClient } from '../services/database'
import { withSecurityScopedAccess } from '../services/securityScopedBookmarks'

/** Strips path separators and characters that are illegal in filenames. */
function sanitizeBaseName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function registerModelActionsIpc(): void {
  ipcMain.handle('model:deleteModel', async (_event, modelFileId: string): Promise<void> => {
    const repository = new ModelFileRepository(await getDatabaseClient())
    const file = await repository.findById(modelFileId)
    if (!file) {
      throw new Error('Model not found')
    }

    // Best-effort: a missing file should still clear the library record.
    try {
      await withSecurityScopedAccess(file.absolutePath, () =>
        shell.trashItem(file.absolutePath),
      )
    } catch {
      // File already moved or deleted on disk — proceed with DB/render cleanup.
    }

    const storage = new RenderAssetStorage(getModelRendersRoot())
    await storage.clearModelRenders(modelFileId)
    await repository.deleteModelFile(modelFileId)
  })

  ipcMain.handle(
    'model:renameModel',
    async (_event, modelFileId: string, newName: string): Promise<ModelFile> => {
      const client = await getDatabaseClient()
      const repository = new ModelFileRepository(client)
      const file = await repository.findById(modelFileId)
      if (!file) {
        throw new Error('Model not found')
      }

      const extension = extname(file.absolutePath)
      const requested = sanitizeBaseName(newName)
      // Drop a duplicate extension if the user typed one in.
      const base = requested.toLowerCase().endsWith(extension.toLowerCase())
        ? requested.slice(0, requested.length - extension.length).trim()
        : requested
      if (!base) {
        throw new Error('The new name cannot be empty')
      }

      const directory = dirname(file.absolutePath)
      const newFilename = `${base}${extension}`
      const newAbsolutePath = join(directory, newFilename)

      if (newAbsolutePath === file.absolutePath) {
        return file
      }
      if (await repository.findByPath(newAbsolutePath)) {
        throw new Error('A model with that name already exists in this folder')
      }

      await withSecurityScopedAccess(file.absolutePath, () =>
        rename(file.absolutePath, newAbsolutePath),
      )

      // Preserve the directory portion of the stored relative path.
      const relativeDir = dirname(file.relativePath)
      const newRelativePath =
        relativeDir === '.' ? newFilename : join(relativeDir, newFilename)

      await repository.renameModelFile(modelFileId, {
        absolutePath: newAbsolutePath,
        relativePath: newRelativePath,
        filename: newFilename,
      })

      // Keep the model's displayed title in sync with the new name.
      await new AiDescriptionRepository(client).updateShortName(modelFileId, base)

      return (await repository.findById(modelFileId)) ?? file
    },
  )
}
