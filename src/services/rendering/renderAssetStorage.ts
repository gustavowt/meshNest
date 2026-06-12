import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { RenderViewName } from '@/types/modelRender'

/**
 * Disk storage for generated render images. Each model file gets a
 * deterministic folder named after its ID:
 *
 *   <rendersRoot>/<model-file-id>/<view>.png
 *
 * The renders root lives in the app-data directory (see
 * electron/main/services/appDataPaths.ts), never next to source models.
 */
export class RenderAssetStorage {
  constructor(private readonly rendersRoot: string) {}

  getModelRenderDirectory(modelFileId: string): string {
    return path.join(this.rendersRoot, modelFileId)
  }

  /** Stable path for a view image, independent of when it is rendered. */
  getViewPath(modelFileId: string, viewName: RenderViewName): string {
    return path.join(this.getModelRenderDirectory(modelFileId), `${viewName}.png`)
  }

  /** Writes a PNG for the given view and returns its absolute path. */
  async saveRenderAsset(
    modelFileId: string,
    viewName: RenderViewName,
    pngContent: Uint8Array,
  ): Promise<string> {
    const directory = this.getModelRenderDirectory(modelFileId)
    await mkdir(directory, { recursive: true })
    const filePath = this.getViewPath(modelFileId, viewName)
    await writeFile(filePath, pngContent)
    return filePath
  }

  /** Removes all render images for a model (used before reindexing). */
  async clearModelRenders(modelFileId: string): Promise<void> {
    await rm(this.getModelRenderDirectory(modelFileId), { recursive: true, force: true })
  }

  /** Lists existing render image filenames for a model. */
  async listModelRenderFiles(modelFileId: string): Promise<string[]> {
    try {
      const entries = await readdir(this.getModelRenderDirectory(modelFileId))
      return entries.sort()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw error
    }
  }
}
