// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { AiDescriptionRepository } from '@/services/database/aiDescriptionRepository'
import { DuckDbClient } from '@/services/database/duckdbClient'
import { runMigrations } from '@/services/database/migrations'
import {
  aiModelDescriptionSchema,
  validateVisionResponse,
  VisionValidationError,
} from '@/services/llm/jsonValidation'
import { MockVisionProvider } from '@/services/llm/mockVisionProvider'
import { VISION_PROMPT } from '@/services/llm/prompts'
import type { VisionAnalysisInput, VisionProvider } from '@/services/llm/visionProvider'

function analysisInput(overrides: Partial<VisionAnalysisInput> = {}): VisionAnalysisInput {
  return {
    filename: 'dragon-phone-stand.stl',
    extension: 'stl',
    images: [{ viewName: 'perspective', base64Png: 'aGVsbG8=' }],
    geometry: { widthMm: 80, heightMm: 120, depthMm: 60 },
    ...overrides,
  }
}

describe('validateVisionResponse', () => {
  test('accepts a valid response object and JSON string', () => {
    const valid = {
      shortName: 'dragon stand',
      description: 'A dragon-shaped phone stand.',
      likelyCategory: 'household',
      tags: ['dragon', 'stand'],
      objectsDetected: ['dragon', 'phone stand'],
      printUse: 'desk accessory',
      style: 'fantasy',
      confidence: 0.8,
      searchPhrases: ['dragon phone stand'],
    }
    expect(validateVisionResponse(valid)).toEqual(valid)
    expect(validateVisionResponse(JSON.stringify(valid))).toEqual(valid)
  })

  test('rejects invalid JSON text', () => {
    expect(() => validateVisionResponse('not json {')).toThrow(VisionValidationError)
  })

  test('rejects responses with a wrong shape', () => {
    expect(() => validateVisionResponse({ shortName: 'x' })).toThrow(VisionValidationError)
    expect(() =>
      validateVisionResponse({
        shortName: 'x',
        description: 'y',
        likelyCategory: 'z',
        tags: ['a'],
        objectsDetected: [],
        confidence: 3,
        searchPhrases: [],
      }),
    ).toThrow(/confidence/)
  })
})

describe('MockVisionProvider', () => {
  const provider: VisionProvider = new MockVisionProvider()

  test('returns valid structured data', async () => {
    const result = await provider.describeModel(analysisInput())

    expect(() => aiModelDescriptionSchema.parse(result.description)).not.toThrow()
    expect(result.description.shortName).toBe('dragon phone stand')
    expect(result.description.tags).toContain('dragon')
    expect(result.description.tags).toContain('stl')
    expect(result.description.confidence).toBeGreaterThan(0)
    expect(result.description.searchPhrases.length).toBeGreaterThan(0)
    expect(JSON.parse(result.rawResponseJson)).toEqual(result.description)
  })

  test('is deterministic for the same input', async () => {
    const first = await provider.describeModel(analysisInput())
    const second = await provider.describeModel(analysisInput())
    expect(second).toEqual(first)
  })

  test('uses 3MF object names when available', async () => {
    const result = await provider.describeModel(
      analysisInput({
        filename: 'box.3mf',
        extension: '3mf',
        packageMetadata: {
          objectNames: ['Body', 'Lid'],
          materialNames: [],
          colorValues: [],
          hasThumbnail: false,
          rawMetadataJson: '{}',
        },
      }),
    )
    expect(result.description.objectsDetected).toEqual(['Body', 'Lid'])
  })

  test('prompt template requests strict JSON output', () => {
    expect(VISION_PROMPT).toContain('Return only valid JSON')
    expect(VISION_PROMPT).toContain('"searchPhrases": string[]')
  })
})

describe('AiDescriptionRepository', () => {
  let client: DuckDbClient
  let repository: AiDescriptionRepository

  beforeEach(async () => {
    client = await DuckDbClient.open(':memory:')
    await runMigrations(client)
    repository = new AiDescriptionRepository(client)
  })

  afterEach(async () => {
    await client.close()
  })

  test('persists and reloads AI descriptions with raw response', async () => {
    const provider = new MockVisionProvider()
    const result = await provider.describeModel(analysisInput())

    await repository.upsert('file-1', result.description, result.rawResponseJson)

    const stored = await repository.getByModelFileId('file-1')
    expect(stored?.shortName).toBe(result.description.shortName)
    expect(stored?.tags).toEqual(result.description.tags)
    expect(stored?.rawResponseJson).toBe(result.rawResponseJson)
  })

  test('upsert replaces previous descriptions', async () => {
    const provider = new MockVisionProvider()
    const first = await provider.describeModel(analysisInput())
    const second = await provider.describeModel(analysisInput({ filename: 'gridfinity-bin.stl' }))

    await repository.upsert('file-1', first.description, first.rawResponseJson)
    await repository.upsert('file-1', second.description, second.rawResponseJson)

    const stored = await repository.getByModelFileId('file-1')
    expect(stored?.shortName).toBe('gridfinity bin')

    const rows = await client.all('SELECT count(*) AS c FROM ai_model_descriptions')
    expect(Number((rows[0] as { c: unknown }).c)).toBe(1)
  })
})
