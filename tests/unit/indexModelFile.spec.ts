// Uses jsdom (default): the 3MF loader needs DOMParser. DuckDB still runs natively.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { AiDescriptionRepository } from '@/services/database/aiDescriptionRepository'
import { DuckDbClient } from '@/services/database/duckdbClient'
import { EmbeddingRepository } from '@/services/database/embeddingRepository'
import { GeometryMetadataRepository } from '@/services/database/geometryMetadataRepository'
import { runMigrations } from '@/services/database/migrations'
import { ModelFileRepository } from '@/services/database/modelFileRepository'
import { RenderAssetRepository } from '@/services/database/renderAssetRepository'
import { ThreeMfMetadataRepository } from '@/services/database/threeMfMetadataRepository'
import { hashBuffer } from '@/services/filesystem/fileHash'
import { indexModelFile } from '@/services/indexing/indexModelFile'
import type { IndexingBackend } from '@/services/indexing/indexingBackend'
import { MockEmbeddingProvider } from '@/services/llm/mockEmbeddingProvider'
import { MockVisionProvider } from '@/services/llm/mockVisionProvider'
import type { NormalizedModel } from '@/services/model-parsing/modelNormalizer'
import { RenderAssetStorage } from '@/services/rendering/renderAssetStorage'
import type { RenderedView } from '@/services/rendering/modelRenderer'
import { RENDER_VIEW_DEFINITIONS } from '@/services/rendering/renderViews'
import type { ScannedFile } from '@/types/modelFile'
import { buildBinaryStl, SPANNING_TRIANGLES } from './helpers/stlFixtures'
import { buildThreeMfPackage } from './helpers/threeMfFixtures'

const PROJECT_ID = 'project-1'

let filesDir: string
let rendersDir: string
let client: DuckDbClient
let backend: IndexingBackend
let modelFiles: ModelFileRepository

/** Stand-in for the WebGL renderer (jsdom has no WebGL). */
function fakeRenderViews(model: NormalizedModel): RenderedView[] {
  expect(model.maxDimension).toBeGreaterThan(0)
  return RENDER_VIEW_DEFINITIONS.map((view) => ({
    viewName: view.viewName,
    png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
    width: view.width,
    height: view.height,
  }))
}

function createTestBackend(db: DuckDbClient, rendersRoot: string): IndexingBackend {
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
        saved.push({ modelFileId, viewName: view.viewName, absolutePath, width: view.width, height: view.height })
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

function writeScannedFile(filename: string, content: Uint8Array | string): ScannedFile {
  const absolutePath = join(filesDir, filename)
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

function deps() {
  return {
    backend,
    visionProvider: new MockVisionProvider(),
    embeddingProvider: new MockEmbeddingProvider(),
    renderViews: fakeRenderViews,
  }
}

beforeAll(() => {
  filesDir = mkdtempSync(join(tmpdir(), 'meshnest-index-files-'))
  rendersDir = mkdtempSync(join(tmpdir(), 'meshnest-index-renders-'))
})

afterAll(() => {
  rmSync(filesDir, { recursive: true, force: true })
  rmSync(rendersDir, { recursive: true, force: true })
})

beforeEach(async () => {
  client = await DuckDbClient.open(':memory:')
  await runMigrations(client)
  backend = createTestBackend(client, rendersDir)
  modelFiles = new ModelFileRepository(client)
})

afterEach(async () => {
  await client.close()
})

describe('indexModelFile', () => {
  test('indexes an STL file end-to-end with mock providers', async () => {
    const file = writeScannedFile('dragon-stand.stl', new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES)))

    const result = await indexModelFile(file, PROJECT_ID, deps())

    expect(result.status).toBe('indexed')
    const record = (await modelFiles.findById(result.modelFileId))!
    expect(record.status).toBe('indexed')
    expect(record.indexedAt).toBeTruthy()

    const geometry = await new GeometryMetadataRepository(client).getByModelFileId(record.id)
    expect(geometry?.triangleCount).toBe(2)

    const renders = await new RenderAssetRepository(client).listByModelFileId(record.id)
    expect(renders).toHaveLength(RENDER_VIEW_DEFINITIONS.length)
    for (const render of renders) {
      expect(existsSync(render.absolutePath)).toBe(true)
    }

    const description = await new AiDescriptionRepository(client).getByModelFileId(record.id)
    expect(description?.shortName).toBe('dragon stand')

    const embedding = await new EmbeddingRepository(client).getByModelFileId(record.id)
    expect(embedding?.sourceText).toContain('Short name: dragon stand')
    expect(embedding?.embedding).toHaveLength(1536)
  })

  test('indexes a 3MF file end-to-end including package metadata', async () => {
    const file = writeScannedFile(
      'storage-box.3mf',
      buildThreeMfPackage({ objectName: 'Box', includeMaterial: true }),
    )

    const result = await indexModelFile(file, PROJECT_ID, deps())

    expect(result.status).toBe('indexed')
    const metadata = await new ThreeMfMetadataRepository(client).getByModelFileId(result.modelFileId)
    expect(metadata?.objectNames).toEqual(['Box'])
    expect(metadata?.materialNames).toEqual(['Red PLA'])

    const description = await new AiDescriptionRepository(client).getByModelFileId(result.modelFileId)
    expect(description?.objectsDetected).toEqual(['Box'])
  })

  test('marks invalid files as failed with a persisted reason', async () => {
    const file = writeScannedFile('broken.stl', 'solid empty\nendsolid empty')

    const result = await indexModelFile(file, PROJECT_ID, deps())

    expect(result.status).toBe('failed')
    expect(result.errorMessage).toContain('STL')

    const record = (await modelFiles.findById(result.modelFileId))!
    expect(record.status).toBe('failed')
    expect(record.errorMessage).toContain('STL')
  })

  test('skips unchanged files on a second run', async () => {
    const file = writeScannedFile('reusable.stl', new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES)))

    const first = await indexModelFile(file, PROJECT_ID, deps())
    expect(first.status).toBe('indexed')

    const second = await indexModelFile(file, PROJECT_ID, deps())
    expect(second.status).toBe('skipped')
    expect(second.modelFileId).toBe(first.modelFileId)
  })

  test('reindexes files whose content changed', async () => {
    const file = writeScannedFile('changing.stl', new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES)))
    await indexModelFile(file, PROJECT_ID, deps())

    const changed = { ...file, contentHash: 'different-hash', modifiedAt: '2026-06-02T08:00:00.000Z' }
    const result = await indexModelFile(changed, PROJECT_ID, deps())
    expect(result.status).toBe('indexed')
  })

  test('a failing file does not prevent other files from being indexed', async () => {
    const bad = writeScannedFile('bad.stl', 'garbage')
    const good = writeScannedFile('good.stl', new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES)))

    const badResult = await indexModelFile(bad, PROJECT_ID, deps())
    const goodResult = await indexModelFile(good, PROJECT_ID, deps())

    expect(badResult.status).toBe('failed')
    expect(goodResult.status).toBe('indexed')
  })
})
