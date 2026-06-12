import { LIST, listValue, VARCHAR } from '@duckdb/node-api'
import type { AIModelDescription } from '@/types/llm'
import type { DuckDbClient } from './duckdbClient'

type AiDescriptionRow = {
  short_name: string
  description: string
  likely_category: string
  tags: string[]
  objects_detected: string[]
  print_use: string | null
  style: string | null
  confidence: number
  search_phrases: string[]
  raw_response_json: string
}

export type StoredAIDescription = AIModelDescription & { rawResponseJson: string }

function toDescription(row: AiDescriptionRow): StoredAIDescription {
  return {
    shortName: row.short_name,
    description: row.description,
    likelyCategory: row.likely_category,
    tags: row.tags ?? [],
    objectsDetected: row.objects_detected ?? [],
    printUse: row.print_use ?? undefined,
    style: row.style ?? undefined,
    confidence: row.confidence,
    searchPhrases: row.search_phrases ?? [],
    rawResponseJson: row.raw_response_json,
  }
}

export class AiDescriptionRepository {
  constructor(private readonly client: DuckDbClient) {}

  /** Replaces any existing description for the model file. */
  async upsert(
    modelFileId: string,
    description: AIModelDescription,
    rawResponseJson: string,
  ): Promise<void> {
    await this.client.run('DELETE FROM ai_model_descriptions WHERE model_file_id = $modelFileId', {
      modelFileId,
    })
    await this.client.run(
      `INSERT INTO ai_model_descriptions (
         model_file_id, short_name, description, likely_category, tags,
         objects_detected, print_use, style, confidence, search_phrases, raw_response_json
       ) VALUES (
         $modelFileId, $shortName, $description, $likelyCategory, $tags,
         $objectsDetected, $printUse, $style, $confidence, $searchPhrases, $rawResponseJson
       )`,
      {
        modelFileId,
        shortName: description.shortName,
        description: description.description,
        likelyCategory: description.likelyCategory,
        tags: listValue(description.tags),
        objectsDetected: listValue(description.objectsDetected),
        printUse: description.printUse ?? null,
        style: description.style ?? null,
        confidence: description.confidence,
        searchPhrases: listValue(description.searchPhrases),
        rawResponseJson,
      },
      {
        tags: LIST(VARCHAR),
        objectsDetected: LIST(VARCHAR),
        searchPhrases: LIST(VARCHAR),
      },
    )
  }

  async getByModelFileId(modelFileId: string): Promise<StoredAIDescription | undefined> {
    const rows = await this.client.all<AiDescriptionRow>(
      `SELECT short_name, description, likely_category, tags, objects_detected,
              print_use, style, confidence, search_phrases, raw_response_json
       FROM ai_model_descriptions WHERE model_file_id = $modelFileId`,
      { modelFileId },
    )
    return rows.length > 0 ? toDescription(rows[0]) : undefined
  }

  /** All stored descriptions keyed by model file id (used for re-embedding). */
  async listAll(): Promise<Array<{ modelFileId: string; description: StoredAIDescription }>> {
    const rows = await this.client.all<AiDescriptionRow & { model_file_id: string }>(
      `SELECT model_file_id, short_name, description, likely_category, tags, objects_detected,
              print_use, style, confidence, search_phrases, raw_response_json
       FROM ai_model_descriptions ORDER BY model_file_id`,
    )
    return rows.map((row) => ({ modelFileId: row.model_file_id, description: toDescription(row) }))
  }
}
