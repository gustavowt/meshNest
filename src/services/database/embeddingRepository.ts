import type { ModelEmbedding } from '@/types/llm'
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

export class EmbeddingRepository {
  constructor(private readonly client: SqliteClient) {}

  /** Replaces any existing embedding for the model file. */
  async upsert(embedding: Omit<ModelEmbedding, 'createdAt'>): Promise<void> {
    if (embedding.dimensions <= 0 || embedding.embedding.length !== embedding.dimensions) {
      throw new Error('Embedding dimension mismatch')
    }

    const vecTable = this.client.vecAvailable
      ? await ensureVecTable(this.client, embedding.dimensions)
      : undefined
    const rawDb = this.client.rawDb
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
  }

  async getByModelFileId(modelFileId: string): Promise<ModelEmbedding | undefined> {
    const query = `SELECT model_file_id, provider, model, dimensions, embedding, source_text, created_at
         FROM model_embeddings WHERE model_file_id = @modelFileId`
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
