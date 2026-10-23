import type { DuckDbClient } from './duckdbClient'
import { ensureVecTable } from './migrations'
import { SqliteClient } from './sqliteClient'

/**
 * In SQLite, embeddings are stored in `model_embeddings` with flexible dimensions,
 * backed by per-dimension sqlite-vec virtual tables (`vec_model_embeddings_${dimensions}`)
 * for vector similarity search.
 *
 * For DuckDB legacy fallback, the table stores fixed-size FLOAT arrays and is
 * rebuilt when dimensions change.
 */

export function buildEmbeddingTableSql(dimensions: number): string {
  return `
CREATE TABLE IF NOT EXISTS model_embeddings (
  model_file_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  embedding FLOAT[${dimensions}],
  source_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);`
}

export const HNSW_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_model_embeddings_hnsw
ON model_embeddings USING HNSW (embedding)
WITH (metric = 'cosine');`

/** Reads the FLOAT[N] size of the embedding column, or active dimensions in SQLite. */
export async function getEmbeddingTableDimensions(
  client: SqliteClient | DuckDbClient,
): Promise<number | undefined> {
  if ('rawDb' in client) {
    try {
      const rows = await client.all<{ dimensions: number }>(
        'SELECT dimensions FROM model_embeddings ORDER BY created_at DESC LIMIT 1',
      )
      if (rows.length > 0 && rows[0].dimensions != null) {
        return Number(rows[0].dimensions)
      }
      return 1536
    } catch {
      return 1536
    }
  }

  const rows = await client.all<{ data_type: string }>(
    `SELECT data_type FROM information_schema.columns
     WHERE table_name = 'model_embeddings' AND column_name = 'embedding'`,
  )
  if (rows.length === 0) {
    return undefined
  }
  const match = rows[0].data_type.match(/\[(\d+)\]/)
  return match ? Number(match[1]) : undefined
}

/**
 * Makes sure the embedding table/virtual table is ready for the given dimensions.
 *
 * In SQLite: creates the per-dimension vec0 table if sqlite-vec is available.
 * Never drops tables or rows, and always returns { rebuilt: false }.
 *
 * In DuckDB: drops and recreates model_embeddings when the column width differs.
 */
export async function ensureEmbeddingTable(
  client: SqliteClient | DuckDbClient,
  dimensions: number,
): Promise<{ rebuilt: boolean }> {
  if (dimensions <= 0) {
    return { rebuilt: false }
  }

  if ('rawDb' in client) {
    if (client.vecAvailable) {
      await ensureVecTable(client, dimensions)
    }
    return { rebuilt: false }
  }

  const current = await getEmbeddingTableDimensions(client)
  if (current === dimensions) {
    return { rebuilt: false }
  }

  // HNSW index type requires VSS; skip DROP/CREATE without it.
  if (client.vssAvailable) {
    await client.run('DROP INDEX IF EXISTS idx_model_embeddings_hnsw')
  }
  await client.run('DROP TABLE IF EXISTS model_embeddings')
  await client.run(buildEmbeddingTableSql(dimensions))
  if (client.vssAvailable) {
    await client.run(HNSW_INDEX_SQL)
  }
  return { rebuilt: current !== undefined }
}

/** Clears all embeddings without changing the table shape. */
export async function clearEmbeddings(client: SqliteClient | DuckDbClient): Promise<void> {
  await client.run('DELETE FROM model_embeddings')
}
