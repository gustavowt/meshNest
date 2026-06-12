// Uses jsdom (default): the 3MF loader needs DOMParser. DuckDB still runs natively.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { DuckDbClient } from '@/services/database/duckdbClient'
import { IndexingJobRepository } from '@/services/database/indexingJobRepository'
import { runMigrations } from '@/services/database/migrations'
import { indexScannedFiles, retryFailedFiles } from '@/services/indexing/indexDirectory'
import type { IndexFilesDeps } from '@/services/indexing/indexDirectory'
import { processIndexQueue } from '@/services/indexing/indexQueue'
import { MockEmbeddingProvider } from '@/services/llm/mockEmbeddingProvider'
import { MockVisionProvider } from '@/services/llm/mockVisionProvider'
import type { IndexingProgress, IndexingResult } from '@/types/indexing'
import type { ScannedFile } from '@/types/modelFile'
import {
  createTestBackend,
  createTestJobTracker,
  fakeRenderViews,
  writeScannedFile as writeScannedFileIn,
} from './helpers/indexingTestUtils'
import { buildBinaryStl, SPANNING_TRIANGLES } from './helpers/stlFixtures'

const PROJECT_ID = 'project-1'

let filesDir: string
let rendersDir: string
let client: DuckDbClient
let deps: IndexFilesDeps

function writeScannedFile(filename: string, content: Uint8Array | string): ScannedFile {
  return writeScannedFileIn(filesDir, filename, content)
}

function validStl(): Uint8Array {
  return new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES))
}

beforeAll(() => {
  filesDir = mkdtempSync(join(tmpdir(), 'meshnest-queue-files-'))
  rendersDir = mkdtempSync(join(tmpdir(), 'meshnest-queue-renders-'))
})

afterAll(() => {
  rmSync(filesDir, { recursive: true, force: true })
  rmSync(rendersDir, { recursive: true, force: true })
})

beforeEach(async () => {
  client = await DuckDbClient.open(':memory:')
  await runMigrations(client)
  deps = {
    backend: createTestBackend(client, rendersDir),
    jobTracker: createTestJobTracker(client),
    visionProvider: new MockVisionProvider(),
    embeddingProvider: new MockEmbeddingProvider(),
    renderViews: fakeRenderViews,
  }
})

afterEach(async () => {
  await client.close()
})

describe('processIndexQueue', () => {
  const okResult = (id: string): IndexingResult => ({ modelFileId: id, status: 'indexed' })

  test('respects the concurrency bound', async () => {
    let active = 0
    let maxActive = 0
    const items = Array.from({ length: 10 }, (_, i) => `item-${i}`)

    const outcome = await processIndexQueue(
      items,
      async (item) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return okResult(item)
      },
      { concurrency: 3 },
    )

    expect(maxActive).toBeLessThanOrEqual(3)
    expect(maxActive).toBeGreaterThan(1)
    expect(outcome.results.filter(Boolean)).toHaveLength(10)
    expect(outcome.cancelled).toBe(false)
  })

  test('emits progress events with a final complete snapshot', async () => {
    const items = ['a.stl', 'b.stl', 'c.stl']
    const snapshots: IndexingProgress[] = []

    await processIndexQueue(items, async (item) => okResult(item), {
      concurrency: 1,
      onProgress: (progress) => snapshots.push(progress),
      itemLabel: (item) => item,
    })

    const last = snapshots.at(-1)!
    expect(last).toMatchObject({ total: 3, processed: 3, indexed: 3, pending: 0 })
    expect(snapshots.some((s) => s.currentFile === 'b.stl')).toBe(true)
    const processedCounts = snapshots.map((s) => s.processed)
    expect(processedCounts).toEqual([...processedCounts].sort((a, b) => a - b))
  })

  test('stops starting new items when the signal aborts', async () => {
    const controller = new AbortController()
    const items = Array.from({ length: 6 }, (_, i) => `item-${i}`)
    let started = 0

    const outcome = await processIndexQueue(
      items,
      async (item) => {
        started += 1
        if (started === 2) {
          controller.abort()
        }
        return okResult(item)
      },
      { concurrency: 1, signal: controller.signal },
    )

    expect(outcome.cancelled).toBe(true)
    expect(started).toBe(2)
    expect(outcome.results.filter(Boolean)).toHaveLength(2)
    expect(outcome.results[5]).toBeUndefined()
  })

  test('converts unexpected worker throws into failed results', async () => {
    const outcome = await processIndexQueue(['boom'], async () => {
      throw new Error('renderer exploded')
    })

    expect(outcome.results[0]).toMatchObject({
      status: 'failed',
      errorMessage: 'renderer exploded',
    })
  })
})

describe('indexScannedFiles', () => {
  test('indexes multiple files and reports an accurate summary', async () => {
    const files = [
      writeScannedFile('alpha.stl', validStl()),
      writeScannedFile('broken.stl', 'solid empty\nendsolid empty'),
      writeScannedFile('beta.stl', validStl()),
    ]

    const outcome = await indexScannedFiles(files, PROJECT_ID, deps, { concurrency: 2 })

    expect(outcome.summary).toEqual({
      total: 3,
      indexed: 2,
      skipped: 0,
      failed: 1,
      pending: 0,
      cancelled: false,
    })
    expect(outcome.resultsByPath.get(files[1].absolutePath)?.status).toBe('failed')
  })

  test('persists one job per file with final statuses and error reasons', async () => {
    const files = [
      writeScannedFile('good.stl', validStl()),
      writeScannedFile('bad.stl', 'garbage'),
    ]

    await indexScannedFiles(files, PROJECT_ID, deps)

    const jobs = await new IndexingJobRepository(client).listRecent()
    expect(jobs).toHaveLength(2)
    const byPath = new Map(jobs.map((job) => [job.absolutePath, job]))

    const good = byPath.get(files[0].absolutePath)!
    expect(good.status).toBe('succeeded')
    expect(good.modelFileId).toBeTruthy()
    expect(good.startedAt).toBeTruthy()
    expect(good.finishedAt).toBeTruthy()

    const bad = byPath.get(files[1].absolutePath)!
    expect(bad.status).toBe('failed')
    expect(bad.errorMessage).toContain('STL')
  })

  test('skips already-indexed files on a second run', async () => {
    const files = [writeScannedFile('stable.stl', validStl())]

    await indexScannedFiles(files, PROJECT_ID, deps)
    const second = await indexScannedFiles(files, PROJECT_ID, deps)

    expect(second.summary.skipped).toBe(1)
    expect(second.summary.indexed).toBe(0)
  })

  test('marks never-started jobs as cancelled after an abort', async () => {
    const controller = new AbortController()
    const files = [
      writeScannedFile('one.stl', validStl()),
      writeScannedFile('two.stl', validStl()),
      writeScannedFile('three.stl', validStl()),
    ]

    let processed = 0
    await indexScannedFiles(files, PROJECT_ID, deps, {
      concurrency: 1,
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.processed > processed) {
          processed = progress.processed
          controller.abort()
        }
      },
    })

    const counts = await new IndexingJobRepository(client).countByStatus()
    expect(counts.succeeded).toBe(1)
    expect(counts.cancelled).toBe(2)
  })

  test('summary reports pending files after cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    const files = [writeScannedFile('never.stl', validStl())]

    const outcome = await indexScannedFiles(files, PROJECT_ID, deps, {
      signal: controller.signal,
    })

    expect(outcome.summary.pending).toBe(1)
    expect(outcome.summary.cancelled).toBe(true)
    expect(outcome.resultsByPath.size).toBe(0)
  })
})

describe('retryFailedFiles', () => {
  test('re-runs only previously failed files and records retry jobs', async () => {
    const good = writeScannedFile('fine.stl', validStl())
    const bad = writeScannedFile('fixme.stl', 'not an stl')
    const files = [good, bad]

    const first = await indexScannedFiles(files, PROJECT_ID, deps)
    expect(first.summary.failed).toBe(1)

    // Fix the broken file before retrying.
    const fixed = writeScannedFile('fixme.stl', validStl())
    const retried = await retryFailedFiles([good, fixed], first.resultsByPath, PROJECT_ID, deps)

    expect(retried.summary.total).toBe(1)
    expect(retried.summary.indexed).toBe(1)
    expect(retried.resultsByPath.has(good.absolutePath)).toBe(false)

    const jobs = await new IndexingJobRepository(client).listRecent()
    expect(jobs.filter((job) => job.jobType === 'retry')).toHaveLength(1)
  })
})
