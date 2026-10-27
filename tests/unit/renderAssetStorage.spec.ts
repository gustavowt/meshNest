// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { SqliteClient } from '@/services/database/sqliteClient'
import { runMigrations } from '@/services/database/migrations'
import { RenderAssetRepository } from '@/services/database/renderAssetRepository'
import { RenderAssetStorage } from '@/services/rendering/renderAssetStorage'

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

let rendersRoot: string

beforeAll(() => {
  rendersRoot = mkdtempSync(join(tmpdir(), 'meshnest-renders-'))
})

afterAll(() => {
  rmSync(rendersRoot, { recursive: true, force: true })
})

describe('RenderAssetStorage', () => {
  test('saves PNG render assets under a deterministic per-model folder', async () => {
    const storage = new RenderAssetStorage(rendersRoot)

    const savedPath = await storage.saveRenderAsset('model-1', 'front', PNG_BYTES)

    expect(savedPath).toBe(join(rendersRoot, 'model-1', 'front.png'))
    expect(savedPath).toBe(storage.getViewPath('model-1', 'front'))
    expect(await readFile(savedPath)).toEqual(Buffer.from(PNG_BYTES))
  })

  test('render assets survive a new storage instance (app restart)', async () => {
    const first = new RenderAssetStorage(rendersRoot)
    await first.saveRenderAsset('model-2', 'thumbnail', PNG_BYTES)

    const second = new RenderAssetStorage(rendersRoot)
    expect(await second.listModelRenderFiles('model-2')).toEqual(['thumbnail.png'])
  })

  test('clearModelRenders removes the model folder for reindexing', async () => {
    const storage = new RenderAssetStorage(rendersRoot)
    await storage.saveRenderAsset('model-3', 'front', PNG_BYTES)
    await storage.saveRenderAsset('model-3', 'top', PNG_BYTES)

    await storage.clearModelRenders('model-3')

    expect(existsSync(storage.getModelRenderDirectory('model-3'))).toBe(false)
    expect(await storage.listModelRenderFiles('model-3')).toEqual([])
  })

  test('overwrites existing views instead of duplicating files', async () => {
    const storage = new RenderAssetStorage(rendersRoot)
    await storage.saveRenderAsset('model-4', 'front', PNG_BYTES)
    await storage.saveRenderAsset('model-4', 'front', Uint8Array.from([9, 9, 9]))

    expect(await storage.listModelRenderFiles('model-4')).toEqual(['front.png'])
    expect(await readFile(storage.getViewPath('model-4', 'front'))).toEqual(Buffer.from([9, 9, 9]))
  })
})

describe('RenderAssetRepository', () => {
  let client: SqliteClient
  let repository: RenderAssetRepository

  beforeEach(async () => {
    client = await SqliteClient.open(':memory:')
    await runMigrations(client)
    repository = new RenderAssetRepository(client)
  })

  afterEach(async () => {
    await client.close()
  })

  test('replaceForModelFile keeps records aligned with files on disk', async () => {
    const storage = new RenderAssetStorage(rendersRoot)
    const frontPath = await storage.saveRenderAsset('model-5', 'front', PNG_BYTES)
    const thumbPath = await storage.saveRenderAsset('model-5', 'thumbnail', PNG_BYTES)

    await repository.replaceForModelFile('model-5', [
      { modelFileId: 'model-5', viewName: 'front', absolutePath: frontPath, width: 512, height: 512 },
      { modelFileId: 'model-5', viewName: 'thumbnail', absolutePath: thumbPath, width: 256, height: 256 },
    ])

    const records = await repository.listByModelFileId('model-5')
    expect(records.map((r) => r.viewName)).toEqual(['front', 'thumbnail'])

    const filesOnDisk = await storage.listModelRenderFiles('model-5')
    expect(filesOnDisk).toEqual(records.map((r) => `${r.viewName}.png`))
    for (const record of records) {
      expect(existsSync(record.absolutePath)).toBe(true)
    }
  })

  test('replaceForModelFile removes previous records', async () => {
    await repository.replaceForModelFile('model-6', [
      { modelFileId: 'model-6', viewName: 'front', absolutePath: '/old/front.png', width: 512, height: 512 },
    ])
    await repository.replaceForModelFile('model-6', [
      { modelFileId: 'model-6', viewName: 'top', absolutePath: '/new/top.png', width: 512, height: 512 },
    ])

    const records = await repository.listByModelFileId('model-6')
    expect(records).toHaveLength(1)
    expect(records[0].viewName).toBe('top')
  })

  test('findThumbnail returns only the thumbnail view', async () => {
    await repository.replaceForModelFile('model-7', [
      { modelFileId: 'model-7', viewName: 'front', absolutePath: '/r/front.png', width: 512, height: 512 },
      { modelFileId: 'model-7', viewName: 'thumbnail', absolutePath: '/r/thumbnail.png', width: 256, height: 256 },
    ])

    const thumbnail = await repository.findThumbnail('model-7')
    expect(thumbnail?.absolutePath).toBe('/r/thumbnail.png')
    expect(await repository.findThumbnail('missing')).toBeUndefined()
  })
})
