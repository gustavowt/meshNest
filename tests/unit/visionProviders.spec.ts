import { describe, expect, test, vi } from 'vitest'
import {
  buildBulkNameNormalizationPrompt,
  buildNameNormalizationPrompt,
  buildVisionUserText,
  parseBulkNormalizedNames,
  stripJsonFences,
  VisionProviderError,
} from '@/services/llm/httpVisionProvider'
import { GeminiVisionProvider } from '@/services/llm/geminiVisionProvider'
import { MockVisionProvider } from '@/services/llm/mockVisionProvider'
import { OllamaVisionProvider } from '@/services/llm/ollamaVisionProvider'
import { OpenAiVisionProvider } from '@/services/llm/openaiVisionProvider'
import { createVisionProvider } from '@/services/llm/visionProviderFactory'
import type { VisionAnalysisInput } from '@/services/llm/visionProvider'

const VALID_DESCRIPTION = {
  shortName: 'Dragon stand',
  description: 'A dragon-shaped phone stand.',
  likelyCategory: 'utility',
  tags: ['dragon', 'stand'],
  objectsDetected: ['dragon'],
  printUse: 'phone stand',
  style: 'stylized',
  confidence: 0.9,
  searchPhrases: ['dragon phone stand'],
}

function sampleInput(): VisionAnalysisInput {
  return {
    filename: 'dragon-stand.stl',
    extension: 'stl',
    images: [
      { viewName: 'front', base64Png: 'QUJD' },
      { viewName: 'top', base64Png: 'REVG' },
    ],
    geometry: { widthMm: 80, heightMm: 120, depthMm: 60, triangleCount: 5000 },
  }
}

type FetchCall = { url: string; init: RequestInit }

function fakeFetch(bodies: string[], status = 200): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  let index = 0
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const body = bodies[Math.min(index, bodies.length - 1)]
    index++
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    }
  })
  return { fetch: impl as unknown as typeof fetch, calls }
}

function openAiBody(content: string): string {
  return JSON.stringify({ choices: [{ message: { content } }] })
}

describe('buildVisionUserText', () => {
  test('includes the JSON prompt, filename, and geometry context', () => {
    const text = buildVisionUserText(sampleInput())
    expect(text).toContain('Return only valid JSON')
    expect(text).toContain('dragon-stand.stl')
    expect(text).toContain('80.0 x 120.0 x 60.0 mm')
    expect(text).toContain('Triangles: 5000')
  })

  test('includes 3MF object and material names when present', () => {
    const input = sampleInput()
    input.packageMetadata = {
      objectNames: ['Body', 'Wing'],
      materialNames: ['PLA Red'],
      colorValues: [],
      hasThumbnail: false,
      rawMetadataJson: '{}',
    }
    const text = buildVisionUserText(input)
    expect(text).toContain('Body, Wing')
    expect(text).toContain('PLA Red')
  })

  test('asks for a non-English language while keeping JSON keys in English', () => {
    const pt = buildVisionUserText({ ...sampleInput(), language: 'pt' })
    expect(pt).toContain('Portuguese')
    expect(pt).toContain('Keep the JSON keys')

    const es = buildVisionUserText({ ...sampleInput(), language: 'es' })
    expect(es).toContain('Spanish')
  })

  test('adds no language instruction for English or when unset', () => {
    expect(buildVisionUserText({ ...sampleInput(), language: 'en' })).not.toContain(
      'Keep the JSON keys',
    )
    expect(buildVisionUserText(sampleInput())).not.toContain('Keep the JSON keys')
  })
})

describe('stripJsonFences', () => {
  test('removes markdown code fences around JSON', () => {
    expect(stripJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripJsonFences('```\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripJsonFences('{"a":1}')).toBe('{"a":1}')
  })
})

describe('name normalization prompts', () => {
  test('adds context and concise-name guidance to the single-file prompt', () => {
    const prompt = buildNameNormalizationPrompt('dragon_phone_stand_v2.stl', 'Category: utility')

    expect(prompt).toContain('dragon_phone_stand_v2.stl')
    expect(prompt).toContain('Category: utility')
    expect(prompt).toContain('2-5 words')
  })

  test('builds and parses bulk rename JSON by id', () => {
    const prompt = buildBulkNameNormalizationPrompt([
      { id: 'a', rawName: 'dragon_phone_stand_v2.stl', context: 'Tags: dragon, stand' },
      { id: 'b', rawName: 'box-final-copy.3mf', context: 'Likely category: organizers' },
    ])

    expect(prompt).toContain('"id": "a"')
    expect(prompt).toContain('dragon_phone_stand_v2.stl')
    expect(prompt).toContain('Avoid duplicate names')

    expect(
      parseBulkNormalizedNames(
        '```json\n{"renames":[{"id":"a","normalizedName":"Dragon Stand"},{"id":"b","normalizedName":"Storage Box"}]}\n```',
      ),
    ).toEqual([
      { id: 'a', normalizedName: 'Dragon Stand' },
      { id: 'b', normalizedName: 'Storage Box' },
    ])
  })
})

describe('OpenAiVisionProvider', () => {
  test('sends prompt + data-URL images and parses the JSON answer', async () => {
    const { fetch, calls } = fakeFetch([openAiBody(JSON.stringify(VALID_DESCRIPTION))])
    const provider = new OpenAiVisionProvider('gpt-4o-mini', 'sk-test', undefined, fetch)

    const result = await provider.describeModel(sampleInput())

    expect(result.description.shortName).toBe('Dragon stand')
    expect(result.rawResponseJson).toContain('choices')

    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.response_format).toEqual({ type: 'json_object' })
    const content = body.messages[0].content
    expect(content[0].type).toBe('text')
    expect(content[1].image_url.url).toBe('data:image/png;base64,QUJD')
    expect(content).toHaveLength(3)
  })

  test('respects a custom base URL for OpenAI-compatible endpoints', async () => {
    const { fetch, calls } = fakeFetch([openAiBody(JSON.stringify(VALID_DESCRIPTION))])
    const provider = new OpenAiVisionProvider('local-model', 'k', 'http://localhost:1234/v1/', fetch)

    await provider.describeModel(sampleInput())
    expect(calls[0].url).toBe('http://localhost:1234/v1/chat/completions')
  })

  test('retries once when the model returns invalid JSON, then succeeds', async () => {
    const { fetch, calls } = fakeFetch([
      openAiBody('not json at all'),
      openAiBody(JSON.stringify(VALID_DESCRIPTION)),
    ])
    const provider = new OpenAiVisionProvider('gpt-4o-mini', 'sk', undefined, fetch)

    const result = await provider.describeModel(sampleInput())
    expect(result.description.likelyCategory).toBe('utility')
    expect(calls).toHaveLength(2)
  })

  test('fails with a clear error after two invalid responses', async () => {
    const { fetch, calls } = fakeFetch([openAiBody('{"wrong": true}')])
    const provider = new OpenAiVisionProvider('gpt-4o-mini', 'sk', undefined, fetch)

    await expect(provider.describeModel(sampleInput())).rejects.toThrow(
      /invalid description twice/,
    )
    expect(calls).toHaveLength(2)
  })

  test('maps HTTP 401 to an API key error without retrying', async () => {
    const { fetch, calls } = fakeFetch(['{"error":"bad key"}'], 401)
    const provider = new OpenAiVisionProvider('gpt-4o-mini', 'sk-bad', undefined, fetch)

    await expect(provider.describeModel(sampleInput())).rejects.toThrow(/rejected the API key/)
    expect(calls).toHaveLength(1)
  })

  test('accepts JSON wrapped in markdown fences', async () => {
    const fenced = '```json\n' + JSON.stringify(VALID_DESCRIPTION) + '\n```'
    const { fetch } = fakeFetch([openAiBody(fenced)])
    const provider = new OpenAiVisionProvider('gpt-4o-mini', 'sk', undefined, fetch)

    const result = await provider.describeModel(sampleInput())
    expect(result.description.shortName).toBe('Dragon stand')
  })

  test('normalizes several names in one text request', async () => {
    const { fetch, calls } = fakeFetch([
      openAiBody(
        JSON.stringify({
          renames: [
            { id: 'a', normalizedName: 'Dragon Stand' },
            { id: 'b', normalizedName: 'Storage Box' },
          ],
        }),
      ),
    ])
    const provider = new OpenAiVisionProvider('gpt-4o-mini', 'sk', undefined, fetch)

    const results = await provider.normalizeNames([
      { id: 'a', rawName: 'dragon_phone_stand_v2.stl', context: 'Tags: dragon, stand' },
      { id: 'b', rawName: 'box-final-copy.3mf', context: 'Likely category: organizers' },
    ])

    expect(results).toEqual([
      { id: 'a', normalizedName: 'Dragon Stand' },
      { id: 'b', normalizedName: 'Storage Box' },
    ])
    expect(calls).toHaveLength(1)
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.messages[0].content).toContain('dragon_phone_stand_v2.stl')
    expect(body.messages[0].content).toContain('"id": "b"')
  })
})

describe('GeminiVisionProvider', () => {
  test('sends inline_data images and parses the candidate text', async () => {
    const body = JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(VALID_DESCRIPTION) }] } }],
    })
    const { fetch, calls } = fakeFetch([body])
    const provider = new GeminiVisionProvider('gemini-2.0-flash', 'g-key', fetch)

    const result = await provider.describeModel(sampleInput())
    expect(result.description.shortName).toBe('Dragon stand')

    expect(calls[0].url).toContain('models/gemini-2.0-flash:generateContent')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['x-goog-api-key']).toBe('g-key')
    const sent = JSON.parse(String(calls[0].init.body))
    expect(sent.generationConfig.responseMimeType).toBe('application/json')
    expect(sent.contents[0].parts[1].inline_data.data).toBe('QUJD')
  })
})

describe('OllamaVisionProvider', () => {
  test('sends base64 images with format json and parses message content', async () => {
    const body = JSON.stringify({ message: { content: JSON.stringify(VALID_DESCRIPTION) } })
    const { fetch, calls } = fakeFetch([body])
    const provider = new OllamaVisionProvider('llava', 'http://localhost:11434', fetch)

    const result = await provider.describeModel(sampleInput())
    expect(result.description.shortName).toBe('Dragon stand')

    expect(calls[0].url).toBe('http://localhost:11434/api/chat')
    const sent = JSON.parse(String(calls[0].init.body))
    expect(sent.format).toBe('json')
    expect(sent.stream).toBe(false)
    expect(sent.messages[0].images).toEqual(['QUJD', 'REVG'])
  })

  test('reports unreachable server clearly', async () => {
    const failingFetch = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const provider = new OllamaVisionProvider('llava', undefined, failingFetch)

    await expect(provider.describeModel(sampleInput())).rejects.toThrow(VisionProviderError)
    await expect(provider.describeModel(sampleInput())).rejects.toThrow(/Could not reach/)
  })
})

describe('createVisionProvider', () => {
  test('selects the implementation matching the settings', () => {
    expect(createVisionProvider({ provider: 'mock', model: 'm' })).toBeInstanceOf(
      MockVisionProvider,
    )
    expect(
      createVisionProvider({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'k' }),
    ).toBeInstanceOf(OpenAiVisionProvider)
    expect(
      createVisionProvider({ provider: 'gemini', model: 'gemini-2.0-flash', apiKey: 'k' }),
    ).toBeInstanceOf(GeminiVisionProvider)
    expect(
      createVisionProvider({ provider: 'ollama', model: 'llava', baseUrl: 'http://x' }),
    ).toBeInstanceOf(OllamaVisionProvider)
  })
})
