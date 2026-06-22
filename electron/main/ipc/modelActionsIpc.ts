import { rename, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, relative } from 'node:path'
import { ipcMain, shell } from 'electron'
import { AiDescriptionRepository } from '../../../src/services/database/aiDescriptionRepository'
import { IndexingJobRepository } from '../../../src/services/database/indexingJobRepository'
import { ModelFileRepository } from '../../../src/services/database/modelFileRepository'
import { RenderAssetStorage } from '../../../src/services/rendering/renderAssetStorage'
import type { ModelFile } from '../../../src/types/modelFile'
import { getModelRendersRoot } from '../services/appDataPaths'
import { getDatabaseClient } from '../services/database'
import { getProviderSettings } from '../services/providerSettings'
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
      const newAbsolutePath = normalize(join(directory, newFilename))
      const previousAbsolutePath = normalize(file.absolutePath)

      if (newAbsolutePath.toLowerCase() === previousAbsolutePath.toLowerCase()) {
        return file
      }
      if (await repository.findByPath(newAbsolutePath)) {
        throw new Error('A model with that name already exists in this folder')
      }

      await withSecurityScopedAccess(previousAbsolutePath, () =>
        rename(previousAbsolutePath, newAbsolutePath),
      )

      const settings = await getProviderSettings()
      const libraryFolder = settings.libraryFolder?.trim()
      const newRelativePath =
        libraryFolder && normalize(libraryFolder).toLowerCase() === normalize(directory).toLowerCase()
          ? relative(libraryFolder, newAbsolutePath)
          : (() => {
              const relativeDir = dirname(file.relativePath)
              return relativeDir === '.' ? newFilename : join(relativeDir, newFilename)
            })()

      await repository.renameModelFile(modelFileId, {
        absolutePath: newAbsolutePath,
        relativePath: newRelativePath,
        filename: newFilename,
      })

      const jobRepository = new IndexingJobRepository(client)
      await jobRepository.updateAbsolutePathForModel(modelFileId, newAbsolutePath)
      await jobRepository.updateAbsolutePath(previousAbsolutePath, newAbsolutePath)

      // Keep the model's displayed title in sync with the new name.
      await new AiDescriptionRepository(client).updateShortName(modelFileId, base)

      await stat(newAbsolutePath)

      const updated = await repository.findById(modelFileId)
      if (!updated || normalize(updated.absolutePath) !== newAbsolutePath) {
        throw new Error('Failed to update the model path in the database')
      }
      return updated
    },
  )
}
