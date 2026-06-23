import { ARRAY, arrayValue, FLOAT } from '@duckdb/node-api'
import type { SearchResult } from '@/types/search'
import type { SupportedModelExtension } from '@/types/modelFile'
import type { DuckDbClient } from './duckdbClient'
import { EmbeddingDimensionError } from './embeddingRepository'
import { getEmbeddingTableDimensions } from './embeddingTable'

export class NoEmbeddingsError extends Error {
  constructor() {
    super('No models have been indexed with embeddings yet. Index a directory first.')
    this.name = 'NoEmbeddingsError'
  }
}

export type SemanticSearchOptions = {
  limit?: number
  projectId?: string
  queryText?: string
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
  rank_distance?: number
}

const DEFAULT_LIMIT = 20
const MIN_TOKEN_LENGTH = 2

const LEXICAL_FIELDS = [
  { sql: 'mf.filename', weight: 0.05 },
  { sql: 'aid.short_name', weight: 0.1 },
  { sql: "array_to_string(coalesce(aid.tags, []), ' ')", weight: 0.12 },
  { sql: "array_to_string(coalesce(aid.search_phrases, []), ' ')", weight: 0.1 },
  { sql: 'aid.description', weight: 0.04 },
  { sql: 'aid.likely_category', weight: 0.03 },
] as const

function toSearchResult(row: SearchRow): SearchResult {
  const distance = Number(row.distance)
  const rankDistance = row.rank_distance === undefined ? distance : Number(row.rank_distance)
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
    // Hybrid rank distance may include lexical boosts; clamp the displayed relevance.
    score: Math.max(0, Math.min(1, 1 - rankDistance / 2)),
  }
}

function buildLexicalTerms(queryText?: string): string[] {
  if (!queryText) {
    return []
  }

  const tokens = queryText
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? []
  const terms = new Set<string>()
  for (const token of tokens) {
    if (token.length < MIN_TOKEN_LENGTH) {
      continue
    }
    terms.add(token)

    const stem = token.replace(
      /(ções|ción|ciones|mente|ados|adas|idos|idas|ado|ada|ido|ida|ões|es|os|as|s|o|a)$/u,
      '',
    )
    if (stem.length >= MIN_TOKEN_LENGTH && stem !== token) {
      terms.add(stem)
    }
  }
  return Array.from(terms)
}

function buildLexicalBoost(queryText?: string): {
  sql: string
  params: Record<string, string>
} {
  const terms = buildLexicalTerms(queryText)
  if (terms.length === 0) {
    return { sql: '0.0', params: {} }
  }

  const params: Record<string, string> = {}
  const clauses: string[] = []
  terms.forEach((term, termIndex) => {
    const paramName = `lexicalTerm${termIndex}`
    params[paramName] = `%${term}%`
    for (const field of LEXICAL_FIELDS) {
      clauses.push(
        `CASE WHEN lower(coalesce(${field.sql}, '')) LIKE $${paramName} ` +
          `THEN ${field.weight} ELSE 0 END`,
      )
    }
  })

  return {
    sql: clauses.join(' + '),
    params,
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
    const tableDimensions = await getEmbeddingTableDimensions(this.client)
    if (tableDimensions !== undefined && queryEmbedding.length !== tableDimensions) {
      throw new EmbeddingDimensionError(queryEmbedding.length, tableDimensions)
    }
    if ((await this.countEmbeddings()) === 0) {
      throw new NoEmbeddingsError()
    }

    const limit = options.limit ?? DEFAULT_LIMIT
    const projectFilter = options.projectId ? 'WHERE mf.project_id = $projectId' : ''
    const lexicalBoost = buildLexicalBoost(options.queryText)
    const rows = await this.client.all<SearchRow>(
      `WITH scored AS (
         SELECT
           mf.id AS model_file_id,
           mf.filename,
           mf.absolute_path,
           mf.extension,
           aid.short_name,
           aid.description,
           aid.likely_category,
           aid.tags,
           mra.absolute_path AS thumbnail_path,
           array_cosine_distance(me.embedding, $queryEmbedding) AS distance,
           ${lexicalBoost.sql} AS lexical_boost
         FROM model_embeddings me
         JOIN model_files mf ON mf.id = me.model_file_id
         LEFT JOIN ai_model_descriptions aid ON aid.model_file_id = mf.id
         LEFT JOIN model_render_assets mra
           ON mra.model_file_id = mf.id AND mra.view_name = 'thumbnail'
         ${projectFilter}
       )
       SELECT
         model_file_id,
         filename,
         absolute_path,
         extension,
         short_name,
         description,
         likely_category,
         tags,
         thumbnail_path,
         distance,
         distance - lexical_boost AS rank_distance
       FROM scored
       ORDER BY rank_distance, distance
       LIMIT $limit`,
      {
        queryEmbedding: arrayValue(queryEmbedding),
        limit,
        ...lexicalBoost.params,
        ...(options.projectId ? { projectId: options.projectId } : {}),
      },
      // Explicit type so sparse vectors are not inferred as integer lists.
      { queryEmbedding: ARRAY(FLOAT, queryEmbedding.length) },
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
