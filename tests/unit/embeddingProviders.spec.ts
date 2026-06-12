import { describe, expect, test, vi } from 'vitest'
import { GeminiEmbeddingProvider } from '@/services/llm/geminiEmbeddingProvider'
import { MockEmbeddingProvider } from '@/services/llm/mockEmbeddingProvider'
import { OllamaEmbeddingProvider } from '@/services/llm/ollamaEmbeddingProvider'
import { OpenAiEmbeddingProvider } from '@/services/llm/openaiEmbeddingProvider'
import { createEmbeddingProvider } from '@/services/llm/embeddingProviderFactory'

type FetchCall = { url: string; init: RequestInit }

function fakeFetch(body: string, status = 200): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    }
  })
  return { fetch: impl as unknown as typeof fetch, calls }
}

const VECTOR_4 = [0.1, 0.2, 0.3, 0.4]

describe('OpenAiEmbeddingProvider', () => {
  test('posts input text and returns the embedding', async () => {
    const { fetch, calls } = fakeFetch(JSON.stringify({ data: [{ embedding: VECTOR_4 }] }))
    const provider = new OpenAiEmbeddingProvider('text-embedding-3-small', 4, 'sk', undefined, fetch)

    const embedding = await provider.embedText('hello world')
    expect(embedding).toEqual(VECTOR_4)

    expect(calls[0].url).toBe('https://api.openai.com/v1/embeddings')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body).toEqual({ model: 'text-embedding-3-small', input: 'hello world' })
  })

  test('rejects when the returned size does not match the settings', async () => {
    const { fetch } = fakeFetch(JSON.stringify({ data: [{ embedding: VECTOR_4 }] }))
    const provider = new OpenAiEmbeddingProvider('text-embedding-3-small', 1536, 'sk', undefined, fetch)

    await expect(provider.embedText('x')).rejects.toThrow(/returned 4 dimensions/)
  })

  test('maps HTTP 401 to an API key error', async () => {
    const { fetch } = fakeFetch('{"error":"no"}', 401)
    const provider = new OpenAiEmbeddingProvider('m', 4, 'bad', undefined, fetch)

    await expect(provider.embedText('x')).rejects.toThrow(/rejected the API key/)
  })
})

describe('GeminiEmbeddingProvider', () => {
  test('posts content parts and returns embedding values', async () => {
    const { fetch, calls } = fakeFetch(JSON.stringify({ embedding: { values: VECTOR_4 } }))
    const provider = new GeminiEmbeddingProvider('text-embedding-004', 4, 'g-key', fetch)

    const embedding = await provider.embedText('hello')
    expect(embedding).toEqual(VECTOR_4)

    expect(calls[0].url).toContain('models/text-embedding-004:embedContent')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.content.parts[0].text).toBe('hello')
  })
})

describe('OllamaEmbeddingProvider', () => {
  test('posts the prompt and returns the embedding', async () => {
    const { fetch, calls } = fakeFetch(JSON.stringify({ embedding: VECTOR_4 }))
    const provider = new OllamaEmbeddingProvider('nomic-embed-text', 4, 'http://localhost:11434', fetch)

    const embedding = await provider.embedText('hello')
    expect(embedding).toEqual(VECTOR_4)

    expect(calls[0].url).toBe('http://localhost:11434/api/embeddings')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body).toEqual({ model: 'nomic-embed-text', prompt: 'hello' })
  })

  test('reports unreachable server clearly', async () => {
    const failingFetch = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const provider = new OllamaEmbeddingProvider('m', 4, undefined, failingFetch)

    await expect(provider.embedText('x')).rejects.toThrow(/Could not reach/)
  })
})

describe('createEmbeddingProvider', () => {
  test('selects the implementation matching the settings', () => {
    expect(
      createEmbeddingProvider({ provider: 'mock', model: 'm', dimensions: 1536 }),
    ).toBeInstanceOf(MockEmbeddingProvider)
    expect(
      createEmbeddingProvider({ provider: 'openai', model: 'm', apiKey: 'k', dimensions: 1536 }),
    ).toBeInstanceOf(OpenAiEmbeddingProvider)
    expect(
      createEmbeddingProvider({ provider: 'gemini', model: 'm', apiKey: 'k', dimensions: 768 }),
    ).toBeInstanceOf(GeminiEmbeddingProvider)
    expect(
      createEmbeddingProvider({ provider: 'ollama', model: 'm', baseUrl: 'http://x', dimensions: 768 }),
    ).toBeInstanceOf(OllamaEmbeddingProvider)
  })

  test('uses the injected factory for the built-in provider', () => {
    const builtin = new MockEmbeddingProvider()
    const provider = createEmbeddingProvider(
      { provider: 'builtin', model: 'minilm', dimensions: 384 },
      { builtinFactory: () => builtin },
    )
    expect(provider).toBe(builtin)
  })

  test('rejects the built-in provider outside the main process', () => {
    expect(() =>
      createEmbeddingProvider({ provider: 'builtin', model: 'minilm', dimensions: 384 }),
    ).toThrow(/main process/)
  })
})
