import type { DuckDbClient } from './duckdbClient'

/**
 * The model_embeddings table stores fixed-size FLOAT arrays (required by
 * the HNSW index when VSS is available), so its column type depends on the
 * active embedding provider. This module inspects and rebuilds the table
 * when the configured dimensions change. Rebuilding drops all stored
 * embeddings: vectors from different providers/models live in different
 * spaces and must be regenerated anyway.
 *
 * HNSW is optional: when `client.vssAvailable` is false (e.g. Mac App Store),
 * the table is created without an HNSW index and search uses brute-force
 * `array_cosine_distance`.
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

/** Reads the FLOAT[N] size of the embedding column, if the table exists. */
export async function getEmbeddingTableDimensions(
  client: DuckDbClient,
): Promise<number | undefined> {
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
 * Makes sure model_embeddings stores vectors of the given size,
 * dropping and recreating the table (and its HNSW index when VSS is
 * available) when the size differs. Returns whether a rebuild happened.
 */
export async function ensureEmbeddingTable(
  client: DuckDbClient,
  dimensions: number,
): Promise<{ rebuilt: boolean }> {
  if (dimensions <= 0) {
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
export async function clearEmbeddings(client: DuckDbClient): Promise<void> {
  await client.run('DELETE FROM model_embeddings')
}
