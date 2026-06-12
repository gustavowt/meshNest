import { DuckDbClient } from '../../../src/services/database/duckdbClient'
import { runMigrations } from '../../../src/services/database/migrations'
import { getDatabasePath } from './appDataPaths'

let clientPromise: Promise<DuckDbClient> | null = null

/**
 * Lazily opens the app database (under userData) and applies migrations.
 * All main-process IPC handlers share this single connection.
 */
export function getDatabaseClient(): Promise<DuckDbClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = await DuckDbClient.open(getDatabasePath())
      await runMigrations(client)
      return client
    })()
  }
  return clientPromise
}
