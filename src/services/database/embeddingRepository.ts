import { arrayValue } from '@duckdb/node-api'
import type { ModelEmbedding } from '@/types/llm'
import { EMBEDDING_DIMENSIONS } from './schema'
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
  constructor(actual: number) {
    super(
      `Embedding has ${actual} dimensions but the database schema expects ${EMBEDDING_DIMENSIONS}. ` +
        'Update EMBEDDING_DIMENSIONS and migrate, or use a matching embedding model.',
    )
    this.name = 'EmbeddingDimensionError'
  }
}

export class EmbeddingRepository {
  constructor(private readonly client: DuckDbClient) {}

  /** Replaces any existing embedding for the model file. */
  async upsert(embedding: Omit<ModelEmbedding, 'createdAt'>): Promise<void> {
    if (embedding.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingDimensionError(embedding.embedding.length)
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
