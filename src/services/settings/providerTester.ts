import type {
  EmbeddingSettings,
  ProviderTestResult,
  VisionSettings,
} from '@/types/providerSettings'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

type FetchLike = typeof fetch

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
 * Cheap connectivity/authentication check for the configured vision
 * provider. Does not spend tokens: uses list/info endpoints only.
 */
export async function testVisionConnection(
  settings: VisionSettings,
  fetchImpl: FetchLike = fetch,
): Promise<ProviderTestResult> {
  switch (settings.provider) {
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
