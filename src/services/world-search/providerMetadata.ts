import type { WorldSearchProviderId } from '@/types/worldSearch'

export type WorldSearchProviderInfo = {
  label: string
  needsApiToken: boolean
  needsApiKey: boolean
  needsUsername: boolean
  needsOAuth: boolean
  /** Provider exposes metadata only; meshNest deep-links to the source page. */
  linkOnly: boolean
  description: string
  setupDocumentation: string[]
  /** Public page where users create or obtain an API token. */
  tokenSetupUrl?: string
}

export const WORLD_SEARCH_PROVIDERS: Record<WorldSearchProviderId, WorldSearchProviderInfo> = {
  sketchfab: {
    label: 'Sketchfab',
    needsApiToken: true,
    needsApiKey: false,
    needsUsername: false,
    needsOAuth: false,
    linkOnly: false,
    description: 'Broad 3D library queried only with printable/STL-focused filters.',
    setupDocumentation: [
      'Sketchfab public search works without a token for basic metadata.',
      'For authenticated/rate-limited access, create or sign in to Sketchfab.',
      'Open Sketchfab account settings, create an API token, and paste it into API token.',
      'meshNest filters Sketchfab toward downloadable, printable/STL-style results.',
    ],
  },
  printables: {
    label: 'Printables',
    needsApiToken: false,
    needsApiKey: false,
    needsUsername: false,
    needsOAuth: false,
    linkOnly: false,
    description: 'Prusa Printables model library via public GraphQL search.',
    setupDocumentation: [
      'No token is required.',
      'meshNest queries Printables public GraphQL for listing metadata.',
      'Enable this provider, save Settings, then run a World Search query.',
      'Results open on Printables; meshNest does not download Printables files in this phase.',
    ],
  },
  makerworld: {
    label: 'MakerWorld',
    needsApiToken: false,
    needsApiKey: false,
    needsUsername: false,
    needsOAuth: false,
    linkOnly: true,
    description: 'Bambu MakerWorld printable models via public search metadata.',
    setupDocumentation: [
      'No token is required.',
      'meshNest queries MakerWorld/Bambu search metadata for printable models.',
      'Enable this provider, save Settings, then run a World Search query.',
      'Results open on MakerWorld; meshNest does not download MakerWorld files in this phase.',
    ],
  },
  crealitycloud: {
    label: 'Creality Cloud',
    needsApiToken: false,
    needsApiKey: false,
    needsUsername: false,
    needsOAuth: false,
    linkOnly: true,
    description: 'Creality Cloud print-focused model library via public smart search.',
    setupDocumentation: [
      'No token is required.',
      'meshNest queries Creality Cloud smart search for listing metadata.',
      'Enable this provider, save Settings, then run a World Search query.',
      'Results open on Creality Cloud; meshNest does not download Creality Cloud files in this phase.',
    ],
  },
}

export const MAIN_WORLD_SEARCH_PROVIDER_IDS: WorldSearchProviderId[] = [
  'sketchfab',
  'printables',
  'makerworld',
  'crealitycloud',
]

export const WORLD_SEARCH_PROVIDER_IDS: WorldSearchProviderId[] = [
  ...MAIN_WORLD_SEARCH_PROVIDER_IDS,
]
