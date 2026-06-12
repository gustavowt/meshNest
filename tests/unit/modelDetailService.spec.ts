// Uses jsdom (default): shared indexing helpers import the 3MF loader chain.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { DuckDbClient } from '@/services/database/duckdbClient'
import { runMigrations } from '@/services/database/migrations'
import { getModelDetail } from '@/services/database/modelDetailService'
import { ModelFileRepository } from '@/services/database/modelFileRepository'
import { indexModelFile } from '@/services/indexing/indexModelFile'
import { MockEmbeddingProvider } from '@/services/llm/mockEmbeddingProvider'
import { MockVisionProvider } from '@/services/llm/mockVisionProvider'
import { RENDER_VIEW_DEFINITIONS } from '@/services/rendering/renderViews'
import {
  createTestBackend,
  fakeRenderViews,
  writeScannedFile,
} from './helpers/indexingTestUtils'
import { buildBinaryStl, SPANNING_TRIANGLES } from './helpers/stlFixtures'
import { buildThreeMfPackage } from './helpers/threeMfFixtures'

const PROJECT_ID = 'project-1'

let filesDir: string
let rendersDir: string
let client: DuckDbClient

beforeAll(() => {
  filesDir = mkdtempSync(join(tmpdir(), 'meshnest-detail-files-'))
  rendersDir = mkdtempSync(join(tmpdir(), 'meshnest-detail-renders-'))
})

afterAll(() => {
  rmSync(filesDir, { recursive: true, force: true })
  rmSync(rendersDir, { recursive: true, force: true })
})

beforeEach(async () => {
  client = await DuckDbClient.open(':memory:')
  await runMigrations(client)
})

afterEach(async () => {
  await client.close()
})

async function indexFixture(filename: string, content: Uint8Array | string) {
  const file = writeScannedFile(filesDir, filename, content)
  return indexModelFile(file, PROJECT_ID, {
    backend: createTestBackend(client, rendersDir),
    visionProvider: new MockVisionProvider(),
    embeddingProvider: new MockEmbeddingProvider(),
    renderViews: fakeRenderViews,
  })
}

describe('getModelDetail', () => {
  test('aggregates file, geometry, description, and renders for an indexed STL', async () => {
    const result = await indexFixture(
      'dragon-stand.stl',
      new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES)),
    )

    const detail = (await getModelDetail(client, result.modelFileId))!
    expect(detail.file.filename).toBe('dragon-stand.stl')
    expect(detail.file.status).toBe('indexed')
    expect(detail.geometry?.triangleCount).toBe(2)
    expect(detail.threeMf).toBeUndefined()
    expect(detail.description?.shortName).toBe('dragon stand')
    expect(detail.description?.searchPhrases.length).toBeGreaterThan(0)
    expect(detail.renderAssets).toHaveLength(RENDER_VIEW_DEFINITIONS.length)
  })

  test('includes 3MF package metadata for 3MF files', async () => {
    const result = await indexFixture(
      'storage-box.3mf',
      buildThreeMfPackage({ objectName: 'Box', includeMaterial: true }),
    )

    const detail = (await getModelDetail(client, result.modelFileId))!
    expect(detail.threeMf?.objectNames).toEqual(['Box'])
    expect(detail.threeMf?.materialNames).toEqual(['Red PLA'])
  })

  test('returns failed files with the error and no description', async () => {
    const result = await indexFixture('broken.stl', 'solid empty\nendsolid empty')

    const detail = (await getModelDetail(client, result.modelFileId))!
    expect(detail.file.status).toBe('failed')
    expect(detail.file.errorMessage).toContain('STL')
    expect(detail.description).toBeUndefined()
    expect(detail.renderAssets).toEqual([])
  })

  test('returns undefined for unknown ids', async () => {
    expect(await getModelDetail(client, 'missing-id')).toBeUndefined()
  })
})

describe('ModelFileRepository.resetToPending', () => {
  test('clears indexed status so the file is reprocessed', async () => {
    const result = await indexFixture(
      'reusable.stl',
      new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES)),
    )
    const repository = new ModelFileRepository(client)

    await repository.resetToPending(result.modelFileId)

    const record = (await repository.findById(result.modelFileId))!
    expect(record.status).toBe('pending')
    expect(record.indexedAt).toBeUndefined()
    expect(record.errorMessage).toBeUndefined()
  })
})
