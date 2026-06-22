import { rename } from 'node:fs/promises'
import { DuckDbClient } from '../../../src/services/database/duckdbClient'
import { ensureEmbeddingTable } from '../../../src/services/database/embeddingTable'
import { runMigrations } from '../../../src/services/database/migrations'
import { getDatabasePath } from './appDataPaths'
import { resolveProviderSettings } from './providerSettings'

let clientPromise: Promise<DuckDbClient> | null = null
let activeClient: DuckDbClient | null = null
let activeGeneration = 0
let recoveryPromise: Promise<void> | null = null

type RunArgs = Parameters<DuckDbClient['run']>
type AllArgs = Parameters<DuckDbClient['all']>

const FATAL_DATABASE_ERROR_MARKERS = [
  'database has been invalidated',
  'Failed to delete all rows from index',
  'FATAL Error',
]

/**
 * Lazily opens the app database (under userData) and applies migrations.
 * All main-process IPC handlers share this single connection.
 */
export function getDatabaseClient(): Promise<DuckDbClient> {
  if (!clientPromise) {
    clientPromise = openDatabaseClient()
  }
  return clientPromise
}

async function openDatabaseClient(): Promise<DuckDbClient> {
  const client = await DuckDbClient.open(getDatabasePath())
  await runMigrations(client)
  // Reconcile the embeddings table with the configured embedding
  // dimensions (the initial migration creates it with a default size).
  const settings = await resolveProviderSettings(client)
  await ensureEmbeddingTable(client, settings.embedding.dimensions)

  activeGeneration += 1
  activeClient = wrapRecoveringClient(client, activeGeneration)
  return activeClient
}

function wrapRecoveringClient(client: DuckDbClient, generation: number): DuckDbClient {
  const run = client.run.bind(client)
  const all = client.all.bind(client)

  client.run = async (...args: RunArgs) => {
    if (generation !== activeGeneration) {
      return (await getDatabaseClient()).run(...args)
    }
    try {
      return await run(...args)
    } catch (error) {
      if (!isFatalDatabaseError(error)) {
        throw error
      }
      await recoverDatabase(error)
      return (await getDatabaseClient()).run(...args)
    }
  }

  client.all = async <T = Record<string, unknown>>(...args: AllArgs): Promise<T[]> => {
    if (generation !== activeGeneration) {
      return (await getDatabaseClient()).all<T>(...args)
    }
    try {
      return await all<T>(...args)
    } catch (error) {
      if (!isFatalDatabaseError(error)) {
        throw error
      }
      await recoverDatabase(error)
      return (await getDatabaseClient()).all<T>(...args)
    }
  }

  return client
}

async function recoverDatabase(error: unknown): Promise<void> {
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

    await backupCorruptDatabaseFiles(error)
    await getDatabaseClient()
  })().finally(() => {
    recoveryPromise = null
  })

  return recoveryPromise
}

async function backupCorruptDatabaseFiles(_error: unknown): Promise<void> {
  const databasePath = getDatabasePath()
  const suffix = `.corrupt-${formatDatabaseBackupTimestamp(new Date())}`

  await moveIfExists(databasePath, `${databasePath}${suffix}`)
  await moveIfExists(`${databasePath}.wal`, `${databasePath}.wal${suffix}`)
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

export function isFatalDatabaseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return FATAL_DATABASE_ERROR_MARKERS.some((marker) => message.includes(marker))
}

export function formatDatabaseBackupTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}
