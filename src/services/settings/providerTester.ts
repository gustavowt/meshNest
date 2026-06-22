import { VisionProviderError } from '@/services/llm/httpVisionProvider'
import { createVisionProvider } from '@/services/llm/visionProviderFactory'
import type {
  EmbeddingSettings,
  ProviderTestResult,
  VisionSettings,
} from '@/types/providerSettings'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

type FetchLike = typeof fetch

function mapVisionTestError(error: unknown): ProviderTestResult {
  if (error instanceof VisionProviderError) {
    return { ok: false, message: error.message }
  }
  const reason = error instanceof Error ? error.message : String(error)
  return { ok: false, message: `Could not reach the provider: ${reason}` }
}

async function checkEndpoint(
  url: string,
  headers: Record<string, string>,
  fetchImpl: FetchLike,
): Promise<ProviderTestResult> {
  try {
    const response = await fetchImpl(url, { headers })
    if (response.ok) {
      return { ok: true, message: 'Connection successful.' }
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: 'Authentication failed. Check the API key.' }
    }
    return { ok: false, message: `Provider responded with HTTP ${response.status}.` }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `Could not reach the provider: ${reason}` }
  }
}

/**
 * Runs a lightweight text-only LLM call through the configured vision
 * provider to verify authentication, model availability, and a usable
 * response (uses a few tokens).
 */
export async function testVisionConnection(
  settings: VisionSettings,
  fetchImpl: FetchLike = fetch,
): Promise<ProviderTestResult> {
  switch (settings.provider) {
    case 'none':
      return { ok: true, message: 'Vision provider is disabled.' }
    case 'mock':
      return { ok: true, message: 'Mock provider is always available.' }
    case 'openai':
    case 'gemini':
    case 'ollama': {
      try {
        const provider = createVisionProvider(settings, fetchImpl)
        const answer = await provider.normalizeName('meshnest_connection_test.stl')
        if (!answer.trim()) {
          return { ok: false, message: 'Model returned an empty response.' }
        }
        return { ok: true, message: 'Model responded successfully.' }
      } catch (error) {
        return mapVisionTestError(error)
      }
    }
  }
}

/**
 * Cheap connectivity/authentication check for the configured embedding
 * provider. The built-in model reports readiness; the actual download
 * happens on first use.
 */
export async function testEmbeddingConnection(
  settings: EmbeddingSettings,
  fetchImpl: FetchLike = fetch,
): Promise<ProviderTestResult> {
  switch (settings.provider) {
    case 'none':
      return { ok: true, message: 'Embedding provider is disabled.' }
    case 'builtin':
      return {
        ok: true,
        message: 'Built-in model ready. It is downloaded automatically on first use.',
      }
    case 'mock':
      return { ok: true, message: 'Mock provider is always available.' }
    case 'openai':
      return checkEndpoint(
        `${(settings.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/models`,
        { Authorization: `Bearer ${settings.apiKey ?? ''}` },
        fetchImpl,
      )
    case 'gemini':
      return checkEndpoint(`${GEMINI_BASE}/models?key=${settings.apiKey ?? ''}`, {}, fetchImpl)
    case 'ollama':
      return checkEndpoint(
        `${(settings.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '')}/api/tags`,
        {},
        fetchImpl,
      )
  }
}
