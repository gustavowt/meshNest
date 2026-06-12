import { DuckDbClient } from '../../../src/services/database/duckdbClient'
import { ensureEmbeddingTable } from '../../../src/services/database/embeddingTable'
import { runMigrations } from '../../../src/services/database/migrations'
import { getDatabasePath } from './appDataPaths'
import { resolveProviderSettings } from './providerSettings'

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
      // Reconcile the embeddings table with the configured embedding
      // dimensions (the initial migration creates it with a default size).
      const settings = await resolveProviderSettings(client)
      await ensureEmbeddingTable(client, settings.embedding.dimensions)
      return client
    })()
  }
  return clientPromise
}
