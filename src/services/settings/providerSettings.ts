import type {
  EmbeddingProviderId,
  EmbeddingSettings,
  ProviderSettings,
  VisionProviderId,
  VisionSettings,
} from '@/types/providerSettings'

/** Built-in local embedding model (downloaded from Hugging Face on first use). */
export const BUILTIN_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'
export const BUILTIN_EMBEDDING_DIMENSIONS = 384

type ProviderInfo = {
  label: string
  needsApiKey: boolean
  needsBaseUrl: boolean
  defaultModel: string
  defaultBaseUrl?: string
}

export const VISION_PROVIDERS: Record<VisionProviderId, ProviderInfo> = {
  mock: {
    label: 'Mock (development)',
    needsApiKey: false,
    needsBaseUrl: false,
    defaultModel: 'mock-vision-1',
  },
  openai: {
    label: 'OpenAI',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
  gemini: {
    label: 'Google Gemini',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'gemini-2.0-flash',
  },
  ollama: {
    label: 'Ollama (local)',
    needsApiKey: false,
    needsBaseUrl: true,
    defaultModel: 'llava',
    defaultBaseUrl: 'http://localhost:11434',
  },
}

export const EMBEDDING_PROVIDERS: Record<EmbeddingProviderId, ProviderInfo & { defaultDimensions: number }> = {
  builtin: {
    label: 'Built-in local model (default)',
    needsApiKey: false,
    needsBaseUrl: false,
    defaultModel: BUILTIN_EMBEDDING_MODEL,
    defaultDimensions: BUILTIN_EMBEDDING_DIMENSIONS,
  },
  mock: {
    label: 'Mock (development)',
    needsApiKey: false,
    needsBaseUrl: false,
    defaultModel: 'mock-embedding-1',
    defaultDimensions: 1536,
  },
  openai: {
    label: 'OpenAI',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'text-embedding-3-small',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultDimensions: 1536,
  },
  gemini: {
    label: 'Google Gemini',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'text-embedding-004',
    defaultDimensions: 768,
  },
  ollama: {
    label: 'Ollama (local)',
    needsApiKey: false,
    needsBaseUrl: true,
    defaultModel: 'nomic-embed-text',
    defaultBaseUrl: 'http://localhost:11434',
    defaultDimensions: 768,
  },
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  vision: {
    provider: 'mock',
    model: VISION_PROVIDERS.mock.defaultModel,
  },
  embedding: {
    provider: 'builtin',
    model: BUILTIN_EMBEDDING_MODEL,
    dimensions: BUILTIN_EMBEDDING_DIMENSIONS,
  },
}

/** Returns sensible defaults when the user switches vision provider. */
export function defaultVisionSettings(provider: VisionProviderId): VisionSettings {
  const info = VISION_PROVIDERS[provider]
  return {
    provider,
    model: info.defaultModel,
    baseUrl: info.defaultBaseUrl,
  }
}

/** Returns sensible defaults when the user switches embedding provider. */
export function defaultEmbeddingSettings(provider: EmbeddingProviderId): EmbeddingSettings {
  const info = EMBEDDING_PROVIDERS[provider]
  return {
    provider,
    model: info.defaultModel,
    baseUrl: info.defaultBaseUrl,
    dimensions: info.defaultDimensions,
  }
}

/**
 * Validates settings before saving. Returns human-readable problems;
 * an empty list means the settings are valid.
 */
export function validateProviderSettings(settings: ProviderSettings): string[] {
  const problems: string[] = []

  const vision = VISION_PROVIDERS[settings.vision.provider]
  if (!vision) {
    problems.push(`Unknown vision provider "${settings.vision.provider}".`)
  } else {
    if (!settings.vision.model.trim()) {
      problems.push('Vision model name is required.')
    }
    if (vision.needsApiKey && !settings.vision.apiKey?.trim()) {
      problems.push(`${vision.label} vision provider requires an API key.`)
    }
    if (vision.needsBaseUrl && !settings.vision.baseUrl?.trim()) {
      problems.push(`${vision.label} vision provider requires a base URL.`)
    }
  }

  const embedding = EMBEDDING_PROVIDERS[settings.embedding.provider]
  if (!embedding) {
    problems.push(`Unknown embedding provider "${settings.embedding.provider}".`)
  } else {
    if (!settings.embedding.model.trim()) {
      problems.push('Embedding model name is required.')
    }
    if (embedding.needsApiKey && !settings.embedding.apiKey?.trim()) {
      problems.push(`${embedding.label} embedding provider requires an API key.`)
    }
    if (embedding.needsBaseUrl && !settings.embedding.baseUrl?.trim()) {
      problems.push(`${embedding.label} embedding provider requires a base URL.`)
    }
    if (!Number.isInteger(settings.embedding.dimensions) || settings.embedding.dimensions <= 0) {
      problems.push('Embedding dimensions must be a positive integer.')
    }
  }

  return problems
}
