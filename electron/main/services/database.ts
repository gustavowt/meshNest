import { existsSync, rmSync } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { SqliteClient } from '../../../src/services/database/sqliteClient'
import { ensureEmbeddingTable } from '../../../src/services/database/embeddingTable'
import { runMigrations } from '../../../src/services/database/migrations'
import { getDatabasePath, getLegacyDuckDbPath } from './appDataPaths'
import { migrateDuckDbToSqlite } from './duckdbMigration'
import { getProviderSettings } from './providerSettings'

let clientPromise: Promise<SqliteClient> | null = null
let activeClient: SqliteClient | null = null
let activeGeneration = 0
let recoveryPromise: Promise<void> | null = null
let resetPromise: Promise<{ ok: boolean; removed: string[]; error?: string }> | null = null

type RunArgs = Parameters<SqliteClient['run']>
type AllArgs = Parameters<SqliteClient['all']>

const FATAL_DATABASE_ERROR_MARKERS = [
  'database disk image is malformed',
  'file is encrypted or is not a database',
  'SQLITE_CORRUPT',
  'SQLITE_NOTADB',
]

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function isSqliteBusyError(error: unknown): boolean {
  if (isNodeError(error) && error.code === 'SQLITE_BUSY') {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('SQLITE_BUSY') || message.includes('database is locked')
}

async function retryOnBusy<T>(fn: () => Promise<T> | T, maxRetries = 5): Promise<T> {
  let attempt = 0
  while (attempt <= maxRetries) {
    try {
      return await fn()
    } catch (error) {
      if (isSqliteBusyError(error) && attempt < maxRetries) {
        attempt += 1
        const delay = Math.min(50 * Math.pow(2, attempt) + Math.random() * 25, 1000)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }
  throw new Error('Retry limit reached')
}

/**
 * Lazily opens the app database (under userData) and applies migrations.
 * All main-process IPC handlers share this single connection.
 */
export function getDatabaseClient(): Promise<SqliteClient> {
  if (resetPromise) {
    return resetPromise.then((res) => {
      if (!res.ok) {
        throw new Error(res.error || 'Failed to reset database')
      }
      return getDatabaseClient()
    })
  }
  if (!clientPromise) {
    clientPromise = openDatabaseClient().catch((err) => {
      clientPromise = null
      throw err
    })
  }
  return clientPromise
}

async function openDatabaseClient(): Promise<SqliteClient> {
  const databasePath = getDatabasePath()
  const legacyDuckDbPath = getLegacyDuckDbPath()
  const sqliteExisted = existsSync(databasePath)

  const client = await SqliteClient.open(databasePath)
  await runMigrations(client)

  if (!sqliteExisted && existsSync(legacyDuckDbPath)) {
    try {
      await migrateDuckDbToSqlite({
        duckdbPath: legacyDuckDbPath,
        sqliteClient: client,
      })
    } catch (error) {
      try {
        await client.close()
      } catch {
        // ignore close error
      }
      await removeFailedDatabaseFiles(databasePath)
      throw error
    }
  }

  // Reconcile the embeddings table with the configured embedding
  // dimensions (the initial migration creates it with a default size).
  const settings = getProviderSettings()
  await ensureEmbeddingTable(client, settings.embedding.dimensions)

  activeGeneration += 1
  activeClient = wrapRecoveringClient(client, activeGeneration)
  return activeClient
}

function wrapRecoveringClient(client: SqliteClient, generation: number): SqliteClient {
  const run = client.run.bind(client)
  const all = client.all.bind(client)

  client.run = async (...args: RunArgs) => {
    if (generation !== activeGeneration) {
      return (await getDatabaseClient()).run(...args)
    }
    try {
      return await retryOnBusy(() => run(...args))
    } catch (error) {
      if (!isFatalDatabaseError(error)) {
        throw error
      }
      await recoverDatabase()
      return (await getDatabaseClient()).run(...args)
    }
  }

  client.all = async <T = Record<string, unknown>>(...args: AllArgs): Promise<T[]> => {
    if (generation !== activeGeneration) {
      return (await getDatabaseClient()).all<T>(...args)
    }
    try {
      return await retryOnBusy(() => all<T>(...args))
    } catch (error) {
      if (!isFatalDatabaseError(error)) {
        throw error
      }
      await recoverDatabase()
      return (await getDatabaseClient()).all<T>(...args)
    }
  }

  return client
}

async function recoverDatabase(): Promise<void> {
  if (recoveryPromise) {
    return recoveryPromise
  }

  recoveryPromise = (async () => {
    const previousClient = activeClient
    activeClient = null
    clientPromise = null
    activeGeneration += 1

    if (previousClient) {
      try {
        await previousClient.close()
      } catch {
        // The connection is already invalidated; proceed with file backup.
      }
    }

    await backupCorruptDatabaseFiles()
    clientPromise = openDatabaseClient().catch((err) => {
      clientPromise = null
      throw err
    })
    await clientPromise
  })().finally(() => {
    recoveryPromise = null
  })

  return recoveryPromise
}

async function backupCorruptDatabaseFiles(): Promise<void> {
  const databasePath = getDatabasePath()
  const suffix = `.corrupt-${formatDatabaseBackupTimestamp(new Date())}`

  await moveIfExists(databasePath, `${databasePath}${suffix}`)
  await moveIfExists(`${databasePath}-wal`, `${databasePath}-wal${suffix}`)
  await moveIfExists(`${databasePath}.wal`, `${databasePath}.wal${suffix}`)
  await moveIfExists(`${databasePath}-shm`, `${databasePath}-shm${suffix}`)
  await moveIfExists(`${databasePath}.shm`, `${databasePath}.shm${suffix}`)
}

async function moveIfExists(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return
    }
    throw error
  }
}

export function isFatalDatabaseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return FATAL_DATABASE_ERROR_MARKERS.some((marker) => message.includes(marker))
}

export function formatDatabaseBackupTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

export const DATABASE_FILE_SUFFIXES = ['', '-wal', '-shm', '.wal', '.shm'] as const

export async function removeFailedDatabaseFiles(databasePath: string): Promise<void> {
  const companionFiles = DATABASE_FILE_SUFFIXES.map((suffix) => `${databasePath}${suffix}`)
  for (const file of companionFiles) {
    try {
      await rm(file, { force: true })
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        continue
      }
      throw error
    }
  }
}

export async function _resetDatabaseStateForTests(): Promise<void> {
  if (activeClient) {
    try {
      await activeClient.close()
    } catch {
      // ignore
    }
  }
  clientPromise = null
  activeClient = null
  activeGeneration = 0
  recoveryPromise = null
  resetPromise = null
}

/**
 * User-invoked reset: closes the active database client, invalidates the
 * cached connection, and deletes the local database files (sqlite main file,
 * WAL/SHM sidecars, and any leftover legacy DuckDB database). Model files,
 * render assets, and settings are untouched. The next getDatabaseClient()
 * call recreates and re-migrates a fresh, empty database.
 * In-flight getDatabaseClient() calls wait for the reset to complete before
 * opening a fresh connection.
 * Returns { ok: boolean, removed: string[], error?: string }.
 */
export function resetDatabase(): Promise<{ ok: boolean; removed: string[]; error?: string }> {
  return (async () => {
    while (recoveryPromise) {
      await recoveryPromise.catch(() => undefined)
    }
    while (resetPromise) {
      await resetPromise.catch(() => undefined)
    }
    const task = performDatabaseReset()
    resetPromise = task
    try {
      return await task
    } finally {
      if (resetPromise === task) {
        resetPromise = null
      }
    }
  })()
}

async function performDatabaseReset(): Promise<{ ok: boolean; removed: string[]; error?: string }> {
  try {
    activeGeneration += 1
    const pendingClientPromise = clientPromise
    const previousClient = activeClient
    clientPromise = null
    activeClient = null

    if (pendingClientPromise) {
      try {
        const pendingClient = await pendingClientPromise
        await pendingClient.close()
      } catch (err) {
        console.warn('Warning: failed to close pending database client during reset:', err)
      }
      activeGeneration += 1
      activeClient = null
    }

    if (previousClient) {
      try {
        await previousClient.close()
      } catch (err) {
        console.warn('Warning: failed to close active database client during reset:', err)
      }
    }

    const dbPath = getDatabasePath()
    const suffixes = [...DATABASE_FILE_SUFFIXES, '-journal']
    const removed: string[] = []

    for (const suffix of suffixes) {
      const filePath = `${dbPath}${suffix}`
      try {
        if (existsSync(filePath)) {
          rmSync(filePath, { force: true })
          removed.push(filePath)
        }
      } catch (err) {
        console.warn(`Warning: failed to remove database file ${filePath}:`, err)
      }
    }

    const legacyDuckDb = getLegacyDuckDbPath()
    for (const file of [legacyDuckDb, `${legacyDuckDb}.wal`]) {
      try {
        if (existsSync(file)) {
          rmSync(file, { force: true })
          removed.push(file)
        }
      } catch (err) {
        console.warn(`Warning: failed to remove legacy database file ${file}:`, err)
      }
    }

    if (existsSync(dbPath)) {
      return {
        ok: false,
        removed: [],
        error: `Failed to remove the database file: ${dbPath}`,
      }
    }

    return { ok: true, removed }
  } catch (error) {
    return {
      ok: false,
      removed: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

