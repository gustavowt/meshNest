/** External 3D model repositories meshNest can query for world search. */
export type WorldSearchProviderId =
  | 'sketchfab'
  | 'printables'
  | 'makerworld'
  | 'crealitycloud'

export type ImageResearchProviderId = 'googleCloudVision'

/** Per-provider credentials stored in Settings (plaintext in localStorage). */
export type WorldSearchProviderCredentials = {
  apiKey?: string
  apiToken?: string
  username?: string
  clientId?: string
  clientSecret?: string
}

export type WorldSearchProviderConfig = {
  enabled: boolean
  credentials?: WorldSearchProviderCredentials
}

export type ImageResearchConfig = {
  enabled: boolean
  provider: ImageResearchProviderId
  credentials: {
    apiKey?: string
  }
}

export type WorldSearchSettings = {
  providers: Record<WorldSearchProviderId, WorldSearchProviderConfig>
  /** Optional web detection used to enrich image-based searches before the final LLM query. */
  imageResearch: ImageResearchConfig
  /** Max hits requested from each enabled provider (clamped server-side). */
  limitPerProvider: number
}

export type WorldSearchQuery = {
  query: string
  /** When set, only these providers are queried (must also be enabled in settings). */
  providerIds?: WorldSearchProviderId[]
  limitPerProvider?: number
}

/** Structured phrases produced from an uploaded reference image. */
export type ImageSearchQuery = {
  query: string
  tags: string[]
  category?: string
}

export type ImageWebResearchResult = {
  bestGuessLabels: string[]
  webEntities: string[]
  pageTitles: string[]
}

export type WorldSearchResult = {
  /** Stable composite id: `${providerId}:${sourceId}` */
  id: string
  providerId: WorldSearchProviderId
  sourceId: string
  title: string
  description?: string
  thumbnailUrl?: string
  sourceUrl: string
  creatorName?: string
  license?: string
  priceLabel?: string
  formats?: string[]
  likes?: number
  downloads?: number
  score: number
}

export type WorldSearchProviderError = {
  providerId: WorldSearchProviderId
  message: string
}

export type WorldSearchResponse = {
  query: string
  results: WorldSearchResult[]
  providerErrors: WorldSearchProviderError[]
}
