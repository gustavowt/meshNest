import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { ipcMain } from 'electron'
import { RenderAssetRepository } from '../../../src/services/database/renderAssetRepository'
import { RenderAssetStorage } from '../../../src/services/rendering/renderAssetStorage'
import type { RenderedView } from '../../../src/services/rendering/modelRenderer'
import type { ModelRenderAsset } from '../../../src/types/modelRender'
import { getModelRendersRoot } from '../services/appDataPaths'
import { getDatabaseClient } from '../services/database'

export function registerRenderingIpc(): void {
  ipcMain.handle(
    'rendering:saveRenderAssets',
    async (_event, modelFileId: string, views: RenderedView[]): Promise<ModelRenderAsset[]> => {
      const storage = new RenderAssetStorage(getModelRendersRoot())
      const repository = new RenderAssetRepository(await getDatabaseClient())

      // Reindexing replaces the full view set, so stale images are removed first.
      await storage.clearModelRenders(modelFileId)

      const saved = []
      for (const view of views) {
        const absolutePath = await storage.saveRenderAsset(
          modelFileId,
          view.viewName,
          new Uint8Array(view.png),
        )
        saved.push({
          modelFileId,
          viewName: view.viewName,
          absolutePath,
          width: view.width,
          height: view.height,
        })
      }
      await repository.replaceForModelFile(modelFileId, saved)
      return repository.listByModelFileId(modelFileId)
    },
  )

  ipcMain.handle(
    'rendering:readRenderAsset',
    async (_event, absolutePath: string): Promise<Uint8Array> => {
      const rendersRoot = resolve(getModelRendersRoot())
      const resolved = resolve(absolutePath)
      // The renderer may only read images that live inside the renders folder.
      if (resolved !== rendersRoot && !resolved.startsWith(rendersRoot + sep)) {
        throw new Error('Path is outside the render assets folder')
      }
      return readFile(resolved)
    },
  )
}
