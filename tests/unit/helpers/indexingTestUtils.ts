import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vitest'
import { AiDescriptionRepository } from '@/services/database/aiDescriptionRepository'
import type { DuckDbClient } from '@/services/database/duckdbClient'
import { EmbeddingRepository } from '@/services/database/embeddingRepository'
import { GeometryMetadataRepository } from '@/services/database/geometryMetadataRepository'
import { IndexingJobRepository } from '@/services/database/indexingJobRepository'
import { ModelFileRepository } from '@/services/database/modelFileRepository'
import { RenderAssetRepository } from '@/services/database/renderAssetRepository'
import { ThreeMfMetadataRepository } from '@/services/database/threeMfMetadataRepository'
import { hashBuffer } from '@/services/filesystem/fileHash'
import type { IndexingJobTracker } from '@/services/indexing/indexDirectory'
import type { IndexingBackend } from '@/services/indexing/indexingBackend'
import type { NormalizedModel } from '@/services/model-parsing/modelNormalizer'
import type { RenderedView } from '@/services/rendering/modelRenderer'
import { RenderAssetStorage } from '@/services/rendering/renderAssetStorage'
import { RENDER_VIEW_DEFINITIONS } from '@/services/rendering/renderViews'
import type { ScannedFile } from '@/types/modelFile'

/** Stand-in for the WebGL renderer (jsdom has no WebGL). */
export function fakeRenderViews(model: NormalizedModel): RenderedView[] {
  expect(model.maxDimension).toBeGreaterThan(0)
  return RENDER_VIEW_DEFINITIONS.map((view) => ({
    viewName: view.viewName,
    png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
    width: view.width,
    height: view.height,
  }))
}

/** In-process IndexingBackend wired to real repositories (no IPC). */
export function createTestBackend(db: DuckDbClient, rendersRoot: string): IndexingBackend {
  const files = new ModelFileRepository(db)
  const geometry = new GeometryMetadataRepository(db)
  const threeMf = new ThreeMfMetadataRepository(db)
  const renders = new RenderAssetRepository(db)
  const storage = new RenderAssetStorage(rendersRoot)
  const descriptions = new AiDescriptionRepository(db)
  const embeddings = new EmbeddingRepository(db)

  return {
    upsertModelFile: (file, projectId) => files.upsertModelFile(file, projectId),
    readModelFile: async (absolutePath) => {
      const { readFile } = await import('node:fs/promises')
      return readFile(absolutePath)
    },
    storeGeometryMetadata: (id, metadata) => geometry.upsert(id, metadata),
    storeThreeMfMetadata: (id, metadata) => threeMf.upsert(id, metadata),
    saveRenderAssets: async (modelFileId, views) => {
      await storage.clearModelRenders(modelFileId)
      const saved = []
      for (const view of views) {
        const absolutePath = await storage.saveRenderAsset(modelFileId, view.viewName, view.png)
        saved.push({
          modelFileId,
          viewName: view.viewName,
          absolutePath,
          width: view.width,
          height: view.height,
        })
      }
      await renders.replaceForModelFile(modelFileId, saved)
      return renders.listByModelFileId(modelFileId)
    },
    storeAiDescription: (id, description, raw) => descriptions.upsert(id, description, raw),
    storeEmbedding: (embedding) => embeddings.upsert(embedding),
    markIndexed: (id) => files.markIndexed(id),
    markFailed: (id, message) => files.markFailed(id, message),
  }
}

/** In-process IndexingJobTracker backed by the real repository. */
export function createTestJobTracker(db: DuckDbClient): IndexingJobTracker {
  const jobs = new IndexingJobRepository(db)
  return {
    createJob: (job) => jobs.create(job),
    markJobRunning: (id) => jobs.markRunning(id),
    finishJob: (id, status, modelFileId, errorMessage) =>
      jobs.finish(id, status, modelFileId, errorMessage),
  }
}

/** Writes a model file to disk and returns its ScannedFile descriptor. */
export function writeScannedFile(
  directory: string,
  filename: string,
  content: Uint8Array | string,
): ScannedFile {
  const absolutePath = join(directory, filename)
  writeFileSync(absolutePath, content)
  return {
    absolutePath,
    relativePath: filename,
    filename,
    extension: filename.toLowerCase().endsWith('.stl') ? 'stl' : '3mf',
    sizeBytes: typeof content === 'string' ? content.length : content.byteLength,
    modifiedAt: '2026-06-01T12:00:00.000Z',
    contentHash: hashBuffer(content),
  }
}
