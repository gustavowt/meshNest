import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { resetIndexingStore, useIndexingStore } from '@/stores/indexingStore'
import { indexScannedFiles } from '@/services/indexing/indexDirectory'
import type { ScannedFile } from '@/types/modelFile'

vi.mock('@/services/indexing/desktopIndexingDeps', () => ({
  createDesktopIndexingDeps: vi.fn(async () => ({})),
}))

vi.mock('@/services/indexing/indexDirectory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/indexing/indexDirectory')>()
  return {
    ...actual,
    indexScannedFiles: vi.fn(async (files: ScannedFile[]) => ({
      summary: {
        total: files.length,
        indexed: files.length,
        skipped: 0,
        failed: 0,
        pending: 0,
        cancelled: false,
      },
      resultsByPath: new Map(
        files.map((file) => [
          file.absolutePath,
          { modelFileId: `id-${file.filename}`, status: 'indexed' },
        ]),
      ),
    })),
  }
})

function scannedFile(filename: string): ScannedFile {
  return {
    absolutePath: `/models/${filename}`,
    relativePath: filename,
    filename,
    extension: 'stl',
    sizeBytes: 100,
    modifiedAt: '2026-06-01T10:00:00.000Z',
    contentHash: `hash-${filename}`,
  }
}

beforeEach(() => {
  resetIndexingStore()
  vi.clearAllMocks()
})

afterEach(() => {
  delete (window as any).meshNest
})

describe('indexingStore', () => {
  test('reconciles failed rows before full directory indexing', async () => {
    const files = [scannedFile('good.stl'), scannedFile('retry.stl')]
    window.meshNest = {
      scanDirectory: vi.fn(async () => files),
      deleteFailedModelFiles: vi.fn(async () => 1),
      upsertModelFile: vi.fn(async (file: ScannedFile) => ({
        id: `id-${file.filename}`,
        projectId: 'default',
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        filename: file.filename,
        extension: file.extension,
        sizeBytes: file.sizeBytes,
        modifiedAt: file.modifiedAt,
        contentHash: file.contentHash,
        status: 'pending',
      })),
    } as any

    const store = useIndexingStore()
    await store.runIndexing('/models')

    expect(window.meshNest.scanDirectory).toHaveBeenCalledWith('/models', expect.any(String))
    expect(window.meshNest.deleteFailedModelFiles).toHaveBeenCalledWith('default')
    expect(window.meshNest.upsertModelFile).toHaveBeenCalledTimes(2)
    expect(window.meshNest.upsertModelFile).toHaveBeenCalledWith(
      files[0],
      'default',
      { relocateByHash: false },
    )
    expect(indexScannedFiles).toHaveBeenCalledWith(
      files,
      'default',
      expect.any(Object),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(store.state.summary?.indexed).toBe(2)
  })
})
