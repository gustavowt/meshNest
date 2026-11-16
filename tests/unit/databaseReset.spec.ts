// @vitest-environment node
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ScannedFile } from '@/types/modelFile'

let mockUserDataDir = ''
const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') {
        return mockUserDataDir || tmpdir()
      }
      return tmpdir()
    }),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler)
    }),
  },
}))
import { registerDatabaseIpc } from '../../electron/main/ipc/databaseIpc'
import {
  getDatabasePath,
  getLegacyDuckDbPath,
  getModelRendersRoot,
} from '../../electron/main/services/appDataPaths'
import {
  getDatabaseClient,
  resetDatabase,
  _resetDatabaseStateForTests,
} from '../../electron/main/services/database'
import { ModelFileRepository } from '@/services/database/modelFileRepository'

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

describe('resetDatabase', () => {
  beforeEach(() => {
    mockUserDataDir = mkdtempSync(join(tmpdir(), 'meshnest-reset-test-'))
  })

  afterEach(async () => {
    await _resetDatabaseStateForTests()
    rmSync(mockUserDataDir, { recursive: true, force: true })
  })

  test('closes the active client and removes the database files', async () => {
    const markerPath = join(mockUserDataDir, 'settings.json')
    writeFileSync(markerPath, '{"theme":"dark"}')

    const renderDir = join(getModelRendersRoot(), 'model-1')
    mkdirSync(renderDir, { recursive: true })
    const renderAssetPath = join(renderDir, 'front.png')
    writeFileSync(renderAssetPath, 'fake png bytes')

    const modelsDir = join(mockUserDataDir, 'models')
    mkdirSync(modelsDir, { recursive: true })
    const modelFilePath = join(modelsDir, 'benchy.3mf')
    writeFileSync(modelFilePath, 'fake 3mf bytes')

    const client = await getDatabaseClient()
    const repository = new ModelFileRepository(client)
    await repository.upsertModelFile(scannedFile(), 'project-1')

    const databasePath = getDatabasePath()
    writeFileSync(`${databasePath}-journal`, 'dummy journal file')

    const result = await resetDatabase()

    expect(result.ok).toBe(true)
    expect(Array.isArray(result.removed)).toBe(true)
    expect(result.removed).toContain(databasePath)
    expect(result.removed).toContain(`${databasePath}-journal`)

    for (const file of [
      databasePath,
      `${databasePath}-wal`,
      `${databasePath}.wal`,
      `${databasePath}-shm`,
      `${databasePath}.shm`,
      `${databasePath}-journal`,
      getLegacyDuckDbPath(),
    ]) {
      expect(existsSync(file)).toBe(false)
    }

    // Non-database files must survive a reset.
    expect(existsSync(markerPath)).toBe(true)
    expect(existsSync(renderAssetPath)).toBe(true)
    expect(existsSync(modelFilePath)).toBe(true)
  })

  test('removes leftover files when no client is active', async () => {
    await _resetDatabaseStateForTests()

    const databasePath = getDatabasePath()
    writeFileSync(databasePath, 'dummy sqlite file')
    writeFileSync(`${databasePath}-wal`, 'dummy wal file')
    writeFileSync(`${databasePath}-shm`, 'dummy shm file')

    const result = await resetDatabase()

    expect(result.ok).toBe(true)
    expect(result.removed.length).toBeGreaterThanOrEqual(3)
    expect(result.removed).toContain(databasePath)
    expect(existsSync(databasePath)).toBe(false)
    expect(existsSync(`${databasePath}-wal`)).toBe(false)
    expect(existsSync(`${databasePath}-shm`)).toBe(false)
  })

  test('the next getDatabaseClient() call recreates and re-migrates a fresh empty database', async () => {
    const client = await getDatabaseClient()
    const repository = new ModelFileRepository(client)
    await repository.upsertModelFile(scannedFile(), 'project-1')

    const before = await client.all<{ c: number }>('SELECT COUNT(*) as c FROM model_files')
    expect(Number(before[0].c)).toBe(1)

    const result = await resetDatabase()
    expect(result.ok).toBe(true)

    const fresh = await getDatabaseClient()
    expect(fresh).not.toBe(client)

    const after = await fresh.all<{ c: number }>('SELECT COUNT(*) as c FROM model_files')
    expect(Number(after[0].c)).toBe(0)
  })

  test('returns an empty list when there is nothing to remove', async () => {
    const result = await resetDatabase()
    expect(result.ok).toBe(true)
    expect(result.removed).toEqual([])
  })

  test('rejects and keeps the old data when the main database file cannot be removed', async () => {
    const client = await getDatabaseClient()
    const repository = new ModelFileRepository(client)
    await repository.upsertModelFile(scannedFile(), 'project-1')

    const databasePath = getDatabasePath()
    // On darwin/linux, removing a directory entry needs write permission on the
    // directory; 0o500 removes owner write so unlinking the db file fails.
    chmodSync(mockUserDataDir, 0o500)
    try {
      const resetCall = resetDatabase()
      // resetPromise is assigned synchronously before resetDatabase suspends,
      // so this call attaches to the reset gate and settles with the reset.
      const gated = getDatabaseClient()

      await expect(gated).rejects.toThrow(/Failed to remove the database file/)
      const res = await resetCall
      expect(res.ok).toBe(false)
      expect(res.error).toMatch(/Failed to remove the database file/)
    } finally {
      // Restore write permission so the failed reset's leftovers (and this
      // temp dir) stay removable in afterEach.
      chmodSync(mockUserDataDir, 0o700)
    }

    // A failed reset must leave the old database intact.
    const reopened = await getDatabaseClient()
    const rows = await reopened.all<{ c: number }>('SELECT COUNT(*) as c FROM model_files')
    expect(Number(rows[0].c)).toBe(1)
    expect(existsSync(databasePath)).toBe(true)
  })

  test('concurrent getDatabaseClient waits for the reset and serves the fresh empty database', async () => {
    const client = await getDatabaseClient()
    const repository = new ModelFileRepository(client)
    await repository.upsertModelFile(scannedFile(), 'project-1')

    const resetCall = resetDatabase()
    const gated = getDatabaseClient()
    const [result, fresh] = await Promise.all([resetCall, gated])

    const databasePath = getDatabasePath()
    expect(result.ok).toBe(true)
    expect(result.removed).toContain(databasePath)

    const rows = await fresh.all<{ c: number }>('SELECT COUNT(*) as c FROM model_files')
    expect(Number(rows[0].c)).toBe(0)
    expect(existsSync(databasePath)).toBe(true)
  })

  test('a wrapped client captured before the reset redirects to the fresh database', async () => {
    const stale = await getDatabaseClient()
    const repository = new ModelFileRepository(stale)
    await repository.upsertModelFile(scannedFile(), 'project-1')

    const before = await stale.all<{ c: number }>('SELECT COUNT(*) as c FROM model_files')
    expect(Number(before[0].c)).toBe(1)

    const result = await resetDatabase()
    expect(result.ok).toBe(true)

    const rows = await stale.all<{ c: number }>('SELECT COUNT(*) as c FROM model_files')
    expect(Number(rows[0].c)).toBe(0)
  })

  test('closes an in-flight getDatabaseClient() open call before removing files', async () => {
    const openCall = getDatabaseClient()
    const resetCall = resetDatabase()
    const [, result] = await Promise.all([openCall.catch(() => null), resetCall])

    const databasePath = getDatabasePath()
    expect(result.ok).toBe(true)
    expect(result.removed).toContain(databasePath)
    expect(existsSync(databasePath)).toBe(false)

    const fresh = await getDatabaseClient()
    const rows = await fresh.all<{ c: number }>('SELECT COUNT(*) as c FROM model_files')
    expect(Number(rows[0].c)).toBe(0)
  })

  test('closes the active client instance and resets client cache', async () => {
    const client1 = await getDatabaseClient()
    const closeSpy = vi.spyOn(client1, 'close')

    await resetDatabase()

    expect(closeSpy).toHaveBeenCalled()
    const client2 = await getDatabaseClient()
    expect(client2).not.toBe(client1)
  })

  test('stale wrapped client redirects run() mutations to the fresh database', async () => {
    const stale = await getDatabaseClient()
    await resetDatabase()

    // Using the stale client wrapper to run an insert executes against the new generation
    const repository = new ModelFileRepository(stale)
    await repository.upsertModelFile(scannedFile(), 'project-after-reset')

    const fresh = await getDatabaseClient()
    const rows = await fresh.all<{ c: number }>('SELECT COUNT(*) as c FROM model_files')
    expect(Number(rows[0].c)).toBe(1)
  })
})

describe('database:reset IPC handler', () => {
  beforeEach(() => {
    mockUserDataDir = mkdtempSync(join(tmpdir(), 'meshnest-reset-ipc-test-'))
    ipcHandlers.clear()
  })

  afterEach(async () => {
    await _resetDatabaseStateForTests()
    rmSync(mockUserDataDir, { recursive: true, force: true })
  })

  test('returns { ok: true, removed } when resetDatabase succeeds', async () => {
    const client = await getDatabaseClient()
    const repository = new ModelFileRepository(client)
    await repository.upsertModelFile(scannedFile(), 'project-1')

    registerDatabaseIpc()
    const handler = ipcHandlers.get('database:reset')
    expect(handler).toBeDefined()

    const result = (await handler!()) as { ok: boolean; removed?: string[]; error?: string }
    expect(result.ok).toBe(true)
    expect(result.removed).toContain(getDatabasePath())
  })

  test('returns { ok: false, error } without throwing when resetDatabase fails', async () => {
    await getDatabaseClient()

    registerDatabaseIpc()
    const handler = ipcHandlers.get('database:reset')
    expect(handler).toBeDefined()

    chmodSync(mockUserDataDir, 0o500)
    try {
      const result = (await handler!()) as { ok: boolean; removed?: string[]; error?: string }
      expect(result.ok).toBe(false)
      expect(result.error).toMatch(/Failed to remove the database file/)
    } finally {
      chmodSync(mockUserDataDir, 0o700)
    }
  })
})

