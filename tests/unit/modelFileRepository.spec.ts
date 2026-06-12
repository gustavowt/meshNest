// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { DuckDbClient } from '@/services/database/duckdbClient'
import { runMigrations } from '@/services/database/migrations'
import { ModelFileRepository } from '@/services/database/modelFileRepository'
import type { ScannedFile } from '@/types/modelFile'

let client: DuckDbClient
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
  client = await DuckDbClient.open(':memory:')
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
      scannedFile({ absolutePath: '/m/b.stl', relativePath: 'b.stl', filename: 'b.stl' }),
      PROJECT_ID,
    )
    await repository.upsertModelFile(
      scannedFile({ absolutePath: '/m/a.3mf', relativePath: 'a.3mf', filename: 'a.3mf', extension: '3mf' }),
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
})
