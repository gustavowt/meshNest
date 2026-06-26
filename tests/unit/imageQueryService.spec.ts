import { afterEach, describe, expect, test, vi } from 'vitest'
import { describeImageQuery } from '../../electron/main/services/world-search/imageQueryService'
import { DEFAULT_WORLD_SEARCH_SETTINGS } from '@/services/settings/worldSearchSettings'
import type { VisionSettings } from '@/types/providerSettings'

type FetchCall = { url: string; init: RequestInit }

function openAiBody(content: string): string {
  return JSON.stringify({ choices: [{ message: { content } }] })
}

describe('describeImageQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('researches the image with Google Web Detection before generating printable search terms', async () => {
    const calls: FetchCall[] = []
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })

      if (String(url).includes('vision.googleapis.com')) {
        return new Response(
          JSON.stringify({
            responses: [
              {
                webDetection: {
                  bestGuessLabels: [{ label: 'Baby Yoda figurine' }],
                  webEntities: [
                    { description: 'Grogu', score: 0.92 },
                    { description: 'Star Wars character', score: 0.72 },
                  ],
                  pagesWithMatchingImages: [{ pageTitle: 'Grogu toy reference' }],
                },
              },
            ],
          }),
          { status: 200 },
        )
      }

      return new Response(
        openAiBody(
          JSON.stringify({
            query: 'Grogu figurine STL',
            tags: ['grogu', 'figurine', 'star wars', 'miniature'],
            category: 'miniatures',
          }),
        ),
        { status: 200 },
      )
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchImpl)

    const worldSearch = JSON.parse(JSON.stringify(DEFAULT_WORLD_SEARCH_SETTINGS))
    worldSearch.imageResearch = {
      enabled: true,
      provider: 'googleCloudVision',
      credentials: { apiKey: 'gcv-key' },
    }
    const vision: VisionSettings = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'openai-key',
    }

    const result = await describeImageQuery('UE5H', vision, 'en', worldSearch, fetchImpl)

    expect(result.query).toBe('Grogu figurine STL')
    expect(calls[0]?.url).toBe('https://vision.googleapis.com/v1/images:annotate?key=gcv-key')
    expect(calls[1]?.url).toBe('https://api.openai.com/v1/chat/completions')

    const visionBody = JSON.parse(String(calls[0]?.init.body))
    expect(visionBody.requests[0].image.content).toBe('UE5H')
    expect(visionBody.requests[0].features[0].type).toBe('WEB_DETECTION')

    const llmBody = JSON.parse(String(calls[1]?.init.body))
    const prompt = llmBody.messages[0].content[0].text
    expect(prompt).toContain('Baby Yoda figurine')
    expect(prompt).toContain('Grogu')
    expect(prompt).toContain('Star Wars character')
    expect(prompt).toContain('Grogu toy reference')
  })
})
