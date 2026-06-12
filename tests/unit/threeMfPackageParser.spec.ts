// @vitest-environment node
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { DuckDbClient } from '@/services/database/duckdbClient'
import { runMigrations } from '@/services/database/migrations'
import { ThreeMfMetadataRepository } from '@/services/database/threeMfMetadataRepository'
import { ModelParseError } from '@/services/model-parsing/modelScene'
import { parseThreeMfPackage } from '@/services/model-parsing/threeMfPackageParser'
import { buildThreeMfPackage } from './helpers/threeMfFixtures'

describe('parseThreeMfPackage', () => {
  test('extracts names, materials, colors, and thumbnail from a full package', () => {
    const content = buildThreeMfPackage({
      objectName: 'Cube',
      includeMaterial: true,
      includeThumbnail: true,
      includeTitle: true,
    })

    const metadata = parseThreeMfPackage(content)

    expect(metadata.objectNames).toEqual(['Cube'])
    expect(metadata.materialNames).toEqual(['Red PLA'])
    expect(metadata.colorValues).toEqual(['#FF0000FF'])
    expect(metadata.hasThumbnail).toBe(true)
    expect(metadata.thumbnailInternalPath).toBe('Metadata/thumbnail.png')

    const raw = JSON.parse(metadata.rawMetadataJson)
    expect(raw.modelPath).toBe('3D/3dmodel.model')
    expect(raw.unit).toBe('millimeter')
    expect(raw.hasContentTypes).toBe(true)
    expect(raw.documentMetadata).toEqual([{ name: 'Title', value: 'Test Cube' }])
  })

  test('missing optional metadata does not fail parsing', () => {
    const metadata = parseThreeMfPackage(buildThreeMfPackage())

    expect(metadata.objectNames).toEqual([])
    expect(metadata.materialNames).toEqual([])
    expect(metadata.colorValues).toEqual([])
    expect(metadata.hasThumbnail).toBe(false)
    expect(metadata.thumbnailInternalPath).toBeUndefined()
  })

  test('collects multiple object names', () => {
    const metadata = parseThreeMfPackage(
      buildThreeMfPackage({ objectName: 'Body', secondObjectName: 'Lid' }),
    )
    expect(metadata.objectNames).toEqual(['Body', 'Lid'])
  })

  test('rejects content that is not a ZIP archive', () => {
    expect(() => parseThreeMfPackage(strToU8('plain text, not a zip'))).toThrow(ModelParseError)
  })

  test('rejects packages without a 3D model part', () => {
    const zipWithoutModel = zipSync({ 'readme.txt': strToU8('nothing here') })
    expect(() => parseThreeMfPackage(zipWithoutModel)).toThrow(ModelParseError)
  })
})

describe('ThreeMfMetadataRepository', () => {
  let client: DuckDbClient
  let repository: ThreeMfMetadataRepository

  beforeEach(async () => {
    client = await DuckDbClient.open(':memory:')
    await runMigrations(client)
    repository = new ThreeMfMetadataRepository(client)
  })

  afterEach(async () => {
    await client.close()
  })

  test('persists and reloads parsed 3MF metadata', async () => {
    const metadata = parseThreeMfPackage(
      buildThreeMfPackage({ objectName: 'Cube', includeMaterial: true, includeThumbnail: true }),
    )
    await repository.upsert('file-1', metadata)

    const stored = await repository.getByModelFileId('file-1')
    expect(stored?.objectNames).toEqual(['Cube'])
    expect(stored?.materialNames).toEqual(['Red PLA'])
    expect(stored?.colorValues).toEqual(['#FF0000FF'])
    expect(stored?.hasThumbnail).toBe(true)
    expect(stored?.thumbnailInternalPath).toBe('Metadata/thumbnail.png')
    expect(JSON.parse(stored?.rawMetadataJson ?? '{}').unit).toBe('millimeter')
  })

  test('upsert replaces existing metadata and handles empty lists', async () => {
    await repository.upsert('file-1', parseThreeMfPackage(buildThreeMfPackage({ objectName: 'A' })))
    await repository.upsert('file-1', parseThreeMfPackage(buildThreeMfPackage()))

    const stored = await repository.getByModelFileId('file-1')
    expect(stored?.objectNames).toEqual([])
    expect(stored?.hasThumbnail).toBe(false)
  })

  test('returns undefined for unknown files', async () => {
    expect(await repository.getByModelFileId('missing')).toBeUndefined()
  })
})
