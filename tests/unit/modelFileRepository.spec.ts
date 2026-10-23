// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { SqliteClient } from '@/services/database/sqliteClient'
import { GeometryMetadataRepository } from '@/services/database/geometryMetadataRepository'
import { runMigrations } from '@/services/database/migrations'
import { ModelFileRepository } from '@/services/database/modelFileRepository'
import type { ScannedFile } from '@/types/modelFile'

let client: SqliteClient
let repository: ModelFileRepository

const PROJECT_ID = 'project-1'

function scannedFile(overrides: Partial<ScannedFile> = {}): ScannedFile {
  return {
    absolutePath: '/models/dragon.stl',
    relativePath: 'dragon.stl',
    filename: 'dragon.stl',
    extension: 'stl',
    sizeBytes: 1024,
    modifiedAt: '2026-06-01T12:00:00.000Z',
    contentHash: 'hash-original',
    ...overrides,
  }
}

beforeEach(async () => {
  client = await SqliteClient.open(':memory:')
  await runMigrations(client)
  repository = new ModelFileRepository(client)
})

afterEach(async () => {
  await client.close()
})

describe('ModelFileRepository', () => {
  test('inserts new files as pending', async () => {
    const inserted = await repository.upsertModelFile(scannedFile(), PROJECT_ID)

    expect(inserted.id).toBeTruthy()
    expect(inserted.projectId).toBe(PROJECT_ID)
    expect(inserted.status).toBe('pending')
    expect(inserted.contentHash).toBe('hash-original')
    expect(inserted.modifiedAt).toBe('2026-06-01T12:00:00.000Z')
    expect(inserted.indexedAt).toBeUndefined()
  })

  test('keeps unchanged files as-is on re-upsert', async () => {
    const inserted = await repository.upsertModelFile(scannedFile(), PROJECT_ID)
    await repository.markIndexed(inserted.id)

    const second = await repository.upsertModelFile(scannedFile(), PROJECT_ID)

    expect(second.id).toBe(inserted.id)
    expect(second.status).toBe('indexed')
    expect(second.indexedAt).toBeTruthy()
  })

  test('handles concurrent same-path upserts as a single row', async () => {
    const results = await Promise.all([
      repository.upsertModelFile(scannedFile(), PROJECT_ID),
      repository.upsertModelFile(scannedFile(), PROJECT_ID),
    ])

    expect(results[1].id).toBe(results[0].id)
    expect(await repository.listModelFiles(PROJECT_ID)).toHaveLength(1)
  })

  test('resets modified files to pending for reindexing', async () => {
    const inserted = await repository.upsertModelFile(scannedFile(), PROJECT_ID)
    await repository.markIndexed(inserted.id)

    const updated = await repository.upsertModelFile(
      scannedFile({ contentHash: 'hash-new', modifiedAt: '2026-06-02T08:00:00.000Z', sizeBytes: 2048 }),
      PROJECT_ID,
    )

    expect(updated.id).toBe(inserted.id)
    expect(updated.status).toBe('pending')
    expect(updated.contentHash).toBe('hash-new')
    expect(updated.sizeBytes).toBe(2048)
    expect(updated.indexedAt).toBeUndefined()
    expect(updated.errorMessage).toBeUndefined()
  })

  test('markFailed preserves the error message', async () => {
    const inserted = await repository.upsertModelFile(scannedFile(), PROJECT_ID)
    await repository.markFailed(inserted.id, 'Invalid STL header')

    const failed = await repository.findById(inserted.id)
    expect(failed?.status).toBe('failed')
    expect(failed?.errorMessage).toBe('Invalid STL header')
  })

  test('findByPath and findByHash locate records', async () => {
    await repository.upsertModelFile(scannedFile(), PROJECT_ID)
    await repository.upsertModelFile(
      scannedFile({
        absolutePath: '/models/copy/dragon.stl',
        relativePath: 'copy/dragon.stl',
      }),
      PROJECT_ID,
    )

    const byPath = await repository.findByPath('/models/dragon.stl')
    expect(byPath?.relativePath).toBe('dragon.stl')

    const duplicates = await repository.findByHash('hash-original')
    expect(duplicates).toHaveLength(2)

    expect(await repository.findByPath('/missing.stl')).toBeUndefined()
    expect(await repository.findByHash('missing-hash')).toEqual([])
  })

  test('listModelFiles and listPendingFiles filter and order results', async () => {
    const a = await repository.upsertModelFile(
      scannedFile({ absolutePath: '/m/b.stl', relativePath: 'b.stl', filename: 'b.stl', contentHash: 'hash-b' }),
      PROJECT_ID,
    )
    await repository.upsertModelFile(
      scannedFile({
        absolutePath: '/m/a.3mf',
        relativePath: 'a.3mf',
        filename: 'a.3mf',
        extension: '3mf',
        contentHash: 'hash-a',
      }),
      PROJECT_ID,
    )
    await repository.markIndexed(a.id)

    const all = await repository.listModelFiles(PROJECT_ID)
    expect(all.map((f) => f.relativePath)).toEqual(['a.3mf', 'b.stl'])

    const pending = await repository.listPendingFiles(PROJECT_ID)
    expect(pending.map((f) => f.relativePath)).toEqual(['a.3mf'])
  })

  test('shouldReindexFile uses status, hash, and modified timestamp', async () => {
    const file = scannedFile()
    expect(repository.shouldReindexFile(undefined, file)).toBe(true)

    const inserted = await repository.upsertModelFile(file, PROJECT_ID)
    expect(repository.shouldReindexFile(inserted, file)).toBe(true) // still pending

    await repository.markIndexed(inserted.id)
    const indexed = (await repository.findById(inserted.id))!
    expect(repository.shouldReindexFile(indexed, file)).toBe(false)

    expect(repository.shouldReindexFile(indexed, { ...file, contentHash: 'changed' })).toBe(true)
    expect(repository.shouldReindexFile(indexed, { ...file, modifiedAt: '2026-06-03T00:00:00.000Z' })).toBe(true)
  })

  test('relocates a renamed file when the same content hash appears at a new path', async () => {
    const inserted = await repository.upsertModelFile(scannedFile(), PROJECT_ID)
    await repository.markFailed(inserted.id, 'Parse error')

    const renamed = await repository.upsertModelFile(
      scannedFile({
        absolutePath: '/models/0.5 Thick.stl',
        relativePath: '0.5 Thick.stl',
        filename: '0.5 Thick.stl',
      }),
      PROJECT_ID,
    )

    expect(renamed.id).toBe(inserted.id)
    expect(renamed.absolutePath).toBe('/models/0.5 Thick.stl')
    expect(renamed.filename).toBe('0.5 Thick.stl')
    expect(renamed.status).toBe('failed')
    expect(await repository.findByPath('/models/dragon.stl')).toBeUndefined()
    expect((await repository.findById(inserted.id))?.absolutePath).toBe('/models/0.5 Thick.stl')
  })

  test('can update absolute_path with special characters and still mark failed', async () => {
    const inserted = await repository.upsertModelFile(
      scannedFile({
        absolutePath: 'C:\\Users\\test\\Downloads\\0.5+Thick.3mf',
        relativePath: '0.5+Thick.3mf',
        filename: '0.5+Thick.3mf',
        extension: '3mf',
      }),
      PROJECT_ID,
    )

    await repository.relocateModelFile(
      inserted.id,
      scannedFile({
        absolutePath: 'C:\\Users\\test\\Downloads\\0.5 Thick.3mf',
        relativePath: '0.5 Thick.3mf',
        filename: '0.5 Thick.3mf',
        extension: '3mf',
      }),
    )

    await repository.markFailed(inserted.id, 'Retry after rename')

    const failed = await repository.findById(inserted.id)
    expect(failed?.absolutePath).toBe('C:\\Users\\test\\Downloads\\0.5 Thick.3mf')
    expect(failed?.status).toBe('failed')
    expect(failed?.errorMessage).toBe('Retry after rename')
  })

  test('deletes failed model files and their child rows without touching indexed files', async () => {
    const geometry = new GeometryMetadataRepository(client as any)
    const failed = await repository.upsertModelFile(
      scannedFile({ absolutePath: '/models/bad.stl', relativePath: 'bad.stl', filename: 'bad.stl' }),
      PROJECT_ID,
    )
    const indexed = await repository.upsertModelFile(
      scannedFile({
        absolutePath: '/models/good.stl',
        relativePath: 'good.stl',
        filename: 'good.stl',
        contentHash: 'hash-good',
      }),
      PROJECT_ID,
    )
    const otherProjectFailed = await repository.upsertModelFile(
      scannedFile({
        absolutePath: '/other/bad.stl',
        relativePath: 'bad.stl',
        filename: 'bad.stl',
        contentHash: 'hash-other',
      }),
      'project-2',
    )

    await repository.markFailed(failed.id, 'Parse error')
    await repository.markIndexed(indexed.id)
    await repository.markFailed(otherProjectFailed.id, 'Other project error')
    await geometry.upsert(failed.id, { widthMm: 10, triangleCount: 12 })
    await geometry.upsert(indexed.id, { widthMm: 20, triangleCount: 24 })

    const deletedIds = await repository.deleteFailedModelFiles(PROJECT_ID)

    expect(deletedIds).toEqual([failed.id])
    expect(await repository.findById(failed.id)).toBeUndefined()
    expect(await geometry.getByModelFileId(failed.id)).toBeUndefined()
    expect((await repository.findById(indexed.id))?.status).toBe('indexed')
    expect(await geometry.getByModelFileId(indexed.id)).toMatchObject({
      widthMm: 20,
      triangleCount: 24,
    })
    expect((await repository.findById(otherProjectFailed.id))?.status).toBe('failed')
  })

  test('can re-add a failed path without relocating an indexed duplicate hash', async () => {
    const indexed = await repository.upsertModelFile(
      scannedFile({
        absolutePath: '/models/good.stl',
        relativePath: 'good.stl',
        filename: 'good.stl',
        contentHash: 'hash-shared',
      }),
      PROJECT_ID,
    )
    const failed = await repository.upsertModelFile(
      scannedFile({
        absolutePath: '/models/bad.stl',
        relativePath: 'bad.stl',
        filename: 'bad.stl',
        contentHash: 'hash-old-failed',
      }),
      PROJECT_ID,
    )
    await repository.markIndexed(indexed.id)
    await repository.markFailed(failed.id, 'Vision failed')
    await repository.deleteFailedModelFiles(PROJECT_ID)

    const readded = await repository.upsertModelFile(
      scannedFile({
        absolutePath: '/models/bad.stl',
        relativePath: 'bad.stl',
        filename: 'bad.stl',
        contentHash: 'hash-shared',
      }),
      PROJECT_ID,
      { relocateByHash: false },
    )

    expect(readded.id).not.toBe(indexed.id)
    expect(readded.status).toBe('pending')
    expect((await repository.findById(indexed.id))?.absolutePath).toBe('/models/good.stl')
  })
})
