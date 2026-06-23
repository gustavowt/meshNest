// Uses jsdom (default): shared indexing helpers import the 3MF loader chain.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { DuckDbClient } from '@/services/database/duckdbClient'
import { LibraryRepository } from '@/services/database/libraryRepository'
import { runMigrations } from '@/services/database/migrations'
import { indexModelFile } from '@/services/indexing/indexModelFile'
import { MockEmbeddingProvider } from '@/services/llm/mockEmbeddingProvider'
import { MockVisionProvider } from '@/services/llm/mockVisionProvider'
import {
  createTestBackend,
  fakeRenderViews,
  writeScannedFile,
} from './helpers/indexingTestUtils'
import { buildBinaryStl, SPANNING_TRIANGLES } from './helpers/stlFixtures'

const PROJECT_ID = 'project-1'

let filesDir: string
let rendersDir: string
let client: DuckDbClient
let repository: LibraryRepository

beforeAll(() => {
  filesDir = mkdtempSync(join(tmpdir(), 'meshnest-library-files-'))
  rendersDir = mkdtempSync(join(tmpdir(), 'meshnest-library-renders-'))
})

afterAll(() => {
  rmSync(filesDir, { recursive: true, force: true })
  rmSync(rendersDir, { recursive: true, force: true })
})

beforeEach(async () => {
  client = await DuckDbClient.open(':memory:')
  await runMigrations(client)
  repository = new LibraryRepository(client)
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

describe('LibraryRepository', () => {
  test('returns indexed entries joined with description and thumbnail', async () => {
    const result = await indexFixture('dragon-stand.stl', new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES)))

    const entries = await repository.listLibraryEntries()
    expect(entries).toHaveLength(1)

    const entry = entries[0]
    expect(entry.filename).toBe('dragon-stand.stl')
    expect(entry.status).toBe('indexed')
    expect(entry.indexedAt).toBeTruthy()
    expect(entry.shortName).toBe('dragon stand')
    expect(entry.likelyCategory).toBeTruthy()
    expect(entry.tags.length).toBeGreaterThan(0)
    expect(entry.thumbnailPath).toContain('thumbnail.png')

    const single = await repository.getLibraryEntry(result.modelFileId)
    expect(single).toEqual(entry)
  })

  test('returns failed entries without description but with error message', async () => {
    await indexFixture('broken.stl', 'solid empty\nendsolid empty')

    const entries = await repository.listLibraryEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].status).toBe('failed')
    expect(entries[0].errorMessage).toContain('STL')
    expect(entries[0].shortName).toBeUndefined()
    expect(entries[0].tags).toEqual([])
    expect(entries[0].thumbnailPath).toBeUndefined()
  })

  test('filters by project id', async () => {
    await indexFixture('one.stl', new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES)))

    expect(await repository.listLibraryEntries(PROJECT_ID)).toHaveLength(1)
    expect(await repository.listLibraryEntries('other-project')).toHaveLength(0)
  })
})
