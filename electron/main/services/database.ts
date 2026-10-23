import { rename } from 'node:fs/promises'
import { SqliteClient } from '../../../src/services/database/sqliteClient'
import { ensureEmbeddingTable } from '../../../src/services/database/embeddingTable'
import { runMigrations } from '../../../src/services/database/migrations'
import { getDatabasePath } from './appDataPaths'
import { getProviderSettings } from './providerSettings'

let clientPromise: Promise<SqliteClient> | null = null
let activeClient: SqliteClient | null = null
let activeGeneration = 0
let recoveryPromise: Promise<void> | null = null

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
  if (!clientPromise) {
    clientPromise = openDatabaseClient()
  }
  return clientPromise
}

async function openDatabaseClient(): Promise<SqliteClient> {
  const client = await SqliteClient.open(getDatabasePath())
  await runMigrations(client)
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
    await getDatabaseClient()
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
