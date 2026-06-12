import { ARRAY, arrayValue, FLOAT } from '@duckdb/node-api'
import type { ModelEmbedding } from '@/types/llm'
import { getEmbeddingTableDimensions } from './embeddingTable'
import type { DuckDbClient } from './duckdbClient'

type EmbeddingRow = {
  model_file_id: string
  provider: string
  model: string
  dimensions: number
  embedding: number[]
  source_text: string
  created_at: string
}

function toEmbedding(row: EmbeddingRow): ModelEmbedding {
  return {
    modelFileId: row.model_file_id,
    provider: row.provider,
    model: row.model,
    dimensions: Number(row.dimensions),
    embedding: row.embedding ?? [],
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
  constructor(private readonly client: DuckDbClient) {}

  /** Replaces any existing embedding for the model file. */
  async upsert(embedding: Omit<ModelEmbedding, 'createdAt'>): Promise<void> {
    const tableDimensions = await getEmbeddingTableDimensions(this.client)
    if (tableDimensions === undefined) {
      throw new Error('model_embeddings table does not exist; run migrations first.')
    }
    if (embedding.embedding.length !== tableDimensions) {
      throw new EmbeddingDimensionError(embedding.embedding.length, tableDimensions)
    }

    await this.client.run('DELETE FROM model_embeddings WHERE model_file_id = $modelFileId', {
      modelFileId: embedding.modelFileId,
    })
    await this.client.run(
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
      // Explicit type: without it DuckDB infers the element type from the
      // leading values, and sparse vectors starting with 0 get truncated
      // to an integer list (silently storing all zeros).
      { embedding: ARRAY(FLOAT, tableDimensions) },
    )
  }

  async getByModelFileId(modelFileId: string): Promise<ModelEmbedding | undefined> {
    const rows = await this.client.all<EmbeddingRow>(
      `SELECT model_file_id, provider, model, dimensions, embedding, source_text, created_at
       FROM model_embeddings WHERE model_file_id = $modelFileId`,
      { modelFileId },
    )
    return rows.length > 0 ? toEmbedding(rows[0]) : undefined
  }

  async countEmbeddings(): Promise<number> {
    const rows = await this.client.all<{ c: number | string }>(
      'SELECT count(*) AS c FROM model_embeddings',
    )
    return Number(rows[0].c)
  }
}
