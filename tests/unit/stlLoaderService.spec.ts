// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { SqliteClient } from '@/services/database/sqliteClient'
import { GeometryMetadataRepository } from '@/services/database/geometryMetadataRepository'
import { runMigrations } from '@/services/database/migrations'
import { extractGeometryMetadata } from '@/services/model-parsing/geometryMetadata'
import { ModelParseError } from '@/services/model-parsing/modelScene'
import { loadStlScene } from '@/services/model-parsing/stlLoaderService'
import { buildAsciiStl, buildBinaryStl, SPANNING_TRIANGLES } from './helpers/stlFixtures'

const encoder = new TextEncoder()

describe('stlLoaderService', () => {
  test('loads ASCII STL files', () => {
    const content = encoder.encode(buildAsciiStl(SPANNING_TRIANGLES))
    const scene = loadStlScene(content)

    expect(scene.source).toBe('stl')
    expect(scene.root.children).toHaveLength(1)
  })

  test('loads binary STL files', () => {
    const scene = loadStlScene(buildBinaryStl(SPANNING_TRIANGLES))

    expect(scene.source).toBe('stl')
    expect(scene.root.children).toHaveLength(1)
    const mesh = scene.root.children[0] as any
    expect(mesh.userData.hasVertexColors).toBe(false)
    expect(mesh.userData.originalColor).toBe(0x8899aa)
  })

  test('applies custom fallbackColor to loaded STL', () => {
    const scene = loadStlScene(buildBinaryStl(SPANNING_TRIANGLES), '#FF6A00')
    const mesh = scene.root.children[0] as any
    expect(mesh.userData.hasVertexColors).toBe(false)
    expect(mesh.userData.originalColor).toBe('#FF6A00')
    expect(mesh.material.color.getHexString()).toBe('ff6a00')
    expect(mesh.material.roughness).toBe(0.35)
    expect(mesh.material.metalness).toBe(0.05)
  })

  test('rejects invalid STL content with a controlled error', () => {
    expect(() => loadStlScene(encoder.encode('not an stl file at all'))).toThrow(ModelParseError)
    expect(() => loadStlScene(encoder.encode('solid empty\nendsolid empty'))).toThrow(ModelParseError)
  })
})

describe('extractGeometryMetadata', () => {
  test('computes consistent dimensions and counts for ASCII and binary STL', () => {
    const asciiMetadata = extractGeometryMetadata(
      loadStlScene(encoder.encode(buildAsciiStl(SPANNING_TRIANGLES))),
    )
    const binaryMetadata = extractGeometryMetadata(loadStlScene(buildBinaryStl(SPANNING_TRIANGLES)))

    for (const metadata of [asciiMetadata, binaryMetadata]) {
      expect(metadata.widthMm).toBeCloseTo(10)
      expect(metadata.heightMm).toBeCloseTo(20)
      expect(metadata.depthMm).toBeCloseTo(30)
      expect(metadata.triangleCount).toBe(2)
      expect(metadata.vertexCount).toBe(6)
      expect(metadata.meshCount).toBe(1)
      expect(metadata.objectCount).toBe(1)
      expect(metadata.surfaceAreaMm2).toBeUndefined()
      expect(metadata.volumeMm3).toBeUndefined()
    }
  })
})

describe('GeometryMetadataRepository', () => {
  let client: SqliteClient
  let repository: GeometryMetadataRepository

  beforeEach(async () => {
    client = await SqliteClient.open(':memory:')
    await runMigrations(client)
    repository = new GeometryMetadataRepository(client)
  })

  afterEach(async () => {
    await client.close()
  })

  test('persists and reloads geometry metadata', async () => {
    const metadata = extractGeometryMetadata(loadStlScene(buildBinaryStl(SPANNING_TRIANGLES)))
    await repository.upsert('file-1', metadata)

    const stored = await repository.getByModelFileId('file-1')
    expect(stored).toBeDefined()
    expect(stored?.widthMm).toBeCloseTo(10)
    expect(stored?.triangleCount).toBe(2)
    expect(stored?.isWatertight).toBeUndefined()

    await repository.upsert('file-watertight', { ...metadata, isWatertight: true })
    expect((await repository.getByModelFileId('file-watertight'))?.isWatertight).toBe(true)

    await repository.upsert('file-not-watertight', { ...metadata, isWatertight: false })
    expect((await repository.getByModelFileId('file-not-watertight'))?.isWatertight).toBe(false)
  })

  test('upsert replaces previous metadata', async () => {
    await repository.upsert('file-1', { triangleCount: 2, vertexCount: 6 })
    await repository.upsert('file-1', { triangleCount: 99, vertexCount: 300 })

    const stored = await repository.getByModelFileId('file-1')
    expect(stored?.triangleCount).toBe(99)

    const rows = await client.all('SELECT count(*) AS c FROM geometry_metadata')
    expect(Number((rows[0] as { c: unknown }).c)).toBe(1)
  })

  test('returns undefined for unknown files', async () => {
    expect(await repository.getByModelFileId('missing')).toBeUndefined()
  })
})
