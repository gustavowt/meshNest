import { ensureVecTable } from './migrations'
import type { SqliteClient } from './sqliteClient'

/**
 * In SQLite, embeddings are stored in `model_embeddings` with flexible dimensions,
 * backed by per-dimension sqlite-vec virtual tables (`vec_model_embeddings_${dimensions}`)
 * for vector similarity search.
 */

/** Reads the active dimensions from the most recently stored embedding in SQLite, or undefined if no embeddings exist. */
export async function getEmbeddingTableDimensions(
  client: SqliteClient,
): Promise<number | undefined> {
  try {
    const rows = await client.all<{ dimensions: number }>(
      'SELECT dimensions FROM model_embeddings ORDER BY created_at DESC LIMIT 1',
    )
    if (rows.length > 0 && rows[0].dimensions != null) {
      return Number(rows[0].dimensions)
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Makes sure the embedding table/virtual table is ready for the given dimensions.
 *
 * In SQLite: creates the per-dimension vec0 table if sqlite-vec is available.
 * Never drops tables or rows, and always returns { rebuilt: false }.
 */
export async function ensureEmbeddingTable(
  client: SqliteClient,
  dimensions: number,
): Promise<{ rebuilt: boolean }> {
  if (dimensions > 0 && client.vecAvailable) {
    await ensureVecTable(client, dimensions)
  }
  return { rebuilt: false }
}

/** Clears all embeddings without changing the table shape. */
export async function clearEmbeddings(client: SqliteClient): Promise<void> {
  await client.run('DELETE FROM model_embeddings')
}
