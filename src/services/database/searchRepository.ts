import { ARRAY, arrayValue, FLOAT } from '@duckdb/node-api'
import type { SearchResult } from '@/types/search'
import type { SupportedModelExtension } from '@/types/modelFile'
import type { DuckDbClient } from './duckdbClient'
import { EmbeddingDimensionError } from './embeddingRepository'
import { EMBEDDING_DIMENSIONS } from './schema'

export class NoEmbeddingsError extends Error {
  constructor() {
    super('No models have been indexed with embeddings yet. Index a directory first.')
    this.name = 'NoEmbeddingsError'
  }
}

export type SemanticSearchOptions = {
  limit?: number
  projectId?: string
}

type SearchRow = {
  model_file_id: string
  filename: string
  absolute_path: string
  extension: string
  short_name: string | null
  description: string | null
  likely_category: string | null
  tags: string[] | null
  thumbnail_path: string | null
  distance: number
}

const DEFAULT_LIMIT = 20

function toSearchResult(row: SearchRow): SearchResult {
  const distance = Number(row.distance)
  return {
    modelFileId: row.model_file_id,
    filename: row.filename,
    absolutePath: row.absolute_path,
    extension: row.extension as SupportedModelExtension,
    shortName: row.short_name ?? undefined,
    description: row.description ?? undefined,
    likelyCategory: row.likely_category ?? undefined,
    tags: row.tags ?? [],
    thumbnailPath: row.thumbnail_path ?? undefined,
    distance,
    // Cosine distance ranges 0..2; map to a 0..1 relevance score.
    score: Math.max(0, Math.min(1, 1 - distance / 2)),
  }
}

/**
 * Vector search over stored embeddings, joined with the metadata
 * needed to render result cards.
 */
export class SearchRepository {
  constructor(private readonly client: DuckDbClient) {}

  async searchByEmbedding(
    queryEmbedding: number[],
    options: SemanticSearchOptions = {},
  ): Promise<SearchResult[]> {
    if (queryEmbedding.length !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingDimensionError(queryEmbedding.length)
    }
    if ((await this.countEmbeddings()) === 0) {
      throw new NoEmbeddingsError()
    }

    const limit = options.limit ?? DEFAULT_LIMIT
    const projectFilter = options.projectId ? 'WHERE mf.project_id = $projectId' : ''
    const rows = await this.client.all<SearchRow>(
      `SELECT
         mf.id AS model_file_id,
         mf.filename,
         mf.absolute_path,
         mf.extension,
         aid.short_name,
         aid.description,
         aid.likely_category,
         aid.tags,
         mra.absolute_path AS thumbnail_path,
         array_cosine_distance(me.embedding, $queryEmbedding) AS distance
       FROM model_embeddings me
       JOIN model_files mf ON mf.id = me.model_file_id
       LEFT JOIN ai_model_descriptions aid ON aid.model_file_id = mf.id
       LEFT JOIN model_render_assets mra
         ON mra.model_file_id = mf.id AND mra.view_name = 'thumbnail'
       ${projectFilter}
       ORDER BY distance
       LIMIT $limit`,
      {
        queryEmbedding: arrayValue(queryEmbedding),
        limit,
        ...(options.projectId ? { projectId: options.projectId } : {}),
      },
      // Explicit type so sparse vectors are not inferred as integer lists.
      { queryEmbedding: ARRAY(FLOAT, EMBEDDING_DIMENSIONS) },
    )
    return rows.map(toSearchResult)
  }

  async countEmbeddings(): Promise<number> {
    const rows = await this.client.all<{ c: number | string }>(
      'SELECT count(*) AS c FROM model_embeddings',
    )
    return Number(rows[0].c)
  }
}
