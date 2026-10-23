import { ARRAY, arrayValue, FLOAT } from '@duckdb/node-api'
import type { ModelEmbedding } from '@/types/llm'
import type { DuckDbClient } from './duckdbClient'
import { getEmbeddingTableDimensions } from './embeddingTable'
import { ensureVecTable } from './migrations'
import type { SqliteClient } from './sqliteClient'

type EmbeddingRow = {
  model_file_id: string
  provider: string
  model: string
  dimensions: number
  embedding: number[] | string | null
  source_text: string
  created_at: string
}

function toEmbedding(row: EmbeddingRow): ModelEmbedding {
  let embedding: number[] = []
  if (Array.isArray(row.embedding)) {
    embedding = row.embedding
  } else if (typeof row.embedding === 'string') {
    try {
      const parsed = JSON.parse(row.embedding)
      embedding = Array.isArray(parsed) ? parsed : []
    } catch {
      embedding = []
    }
  }

  return {
    modelFileId: row.model_file_id,
    provider: row.provider,
    model: row.model,
    dimensions: Number(row.dimensions),
    embedding,
    sourceText: row.source_text,
    createdAt: row.created_at,
  }
}

export class EmbeddingDimensionError extends Error {
  constructor(actual: number, expected: number) {
    super(
      `Embedding has ${actual} dimensions but the database table expects ${expected}. ` +
        'Re-embed the library after changing the embedding provider or model.',
    )
    this.name = 'EmbeddingDimensionError'
  }
}

export class EmbeddingRepository {
  constructor(private readonly client: SqliteClient | DuckDbClient) {}

  private get isSqlite(): boolean {
    return 'rawDb' in this.client
  }

  /** Replaces any existing embedding for the model file. */
  async upsert(embedding: Omit<ModelEmbedding, 'createdAt'>): Promise<void> {
    if (embedding.dimensions <= 0 || embedding.embedding.length !== embedding.dimensions) {
      throw new EmbeddingDimensionError(embedding.embedding.length, embedding.dimensions)
    }

    if (this.isSqlite) {
      const sqlite = this.client as SqliteClient
      const vecTable = sqlite.vecAvailable
        ? await ensureVecTable(sqlite, embedding.dimensions)
        : undefined
      const rawDb = sqlite.rawDb
      const tx = rawDb.transaction(() => {
        rawDb.prepare('DELETE FROM model_embeddings WHERE model_file_id = ?').run(embedding.modelFileId)
        rawDb.prepare(`
          INSERT INTO model_embeddings (model_file_id, provider, model, dimensions, embedding, source_text)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          embedding.modelFileId,
          embedding.provider,
          embedding.model,
          embedding.dimensions,
          JSON.stringify(embedding.embedding),
          embedding.sourceText,
        )
        if (vecTable) {
          rawDb.prepare(`DELETE FROM ${vecTable} WHERE model_file_id = ?`).run(embedding.modelFileId)
          rawDb.prepare(`INSERT INTO ${vecTable} (model_file_id, embedding) VALUES (?, ?)`).run(
            embedding.modelFileId,
            new Float32Array(embedding.embedding),
          )
        }
      })
      tx()
      return
    }

    const duckDb = this.client as DuckDbClient
    const tableDimensions = await getEmbeddingTableDimensions(duckDb)
    if (tableDimensions === undefined) {
      throw new Error('model_embeddings table does not exist; run migrations first.')
    }
    if (embedding.embedding.length !== tableDimensions) {
      throw new EmbeddingDimensionError(embedding.embedding.length, tableDimensions)
    }

    await duckDb.run('DELETE FROM model_embeddings WHERE model_file_id = $modelFileId', {
      modelFileId: embedding.modelFileId,
    })
    await duckDb.run(
      `INSERT INTO model_embeddings (model_file_id, provider, model, dimensions, embedding, source_text)
       VALUES ($modelFileId, $provider, $model, $dimensions, $embedding, $sourceText)`,
      {
        modelFileId: embedding.modelFileId,
        provider: embedding.provider,
        model: embedding.model,
        dimensions: embedding.dimensions,
        embedding: arrayValue(embedding.embedding),
        sourceText: embedding.sourceText,
      },
      { embedding: ARRAY(FLOAT, tableDimensions) },
    )
  }

  async getByModelFileId(modelFileId: string): Promise<ModelEmbedding | undefined> {
    const query = this.isSqlite
      ? `SELECT model_file_id, provider, model, dimensions, embedding, source_text, created_at
         FROM model_embeddings WHERE model_file_id = @modelFileId`
      : `SELECT model_file_id, provider, model, dimensions, embedding, source_text, created_at
         FROM model_embeddings WHERE model_file_id = $modelFileId`
    const rows = await this.client.all<EmbeddingRow>(query, { modelFileId })
    return rows.length > 0 ? toEmbedding(rows[0]) : undefined
  }

  async countEmbeddings(): Promise<number> {
    const rows = await this.client.all<{ c: number | string }>(
      'SELECT count(*) AS c FROM model_embeddings',
    )
    return Number(rows[0]?.c ?? 0)
  }
}
