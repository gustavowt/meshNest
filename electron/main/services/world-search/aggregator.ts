import type {
  WorldSearchProviderError,
  WorldSearchProviderId,
  WorldSearchQuery,
  WorldSearchResponse,
  WorldSearchResult,
  WorldSearchSettings,
} from '@/types/worldSearch'
import { searchCrealityCloud } from './crealityCloudProvider'
import type { FetchLike } from './httpUtils'
import { searchMakerWorld } from './makerWorldProvider'
import { searchPrintables } from './printablesProvider'
import { searchSketchfab } from './sketchfabProvider'

type ProviderRunner = (
  ctx: import('./httpUtils').ProviderSearchContext,
) => Promise<WorldSearchResult[]>

const PROVIDER_RUNNERS: Record<WorldSearchProviderId, ProviderRunner> = {
  sketchfab: searchSketchfab,
  printables: searchPrintables,
  makerworld: searchMakerWorld,
  crealitycloud: searchCrealityCloud,
}

const PRINT_NATIVE_PROVIDER_IDS = new Set<WorldSearchProviderId>([
  'printables',
  'makerworld',
  'crealitycloud',
])

function clampLimit(limit: number | undefined, settings: WorldSearchSettings): number {
  const value = limit ?? settings.limitPerProvider
  return Math.max(1, Math.min(value, 24))
}

function enabledProviderIds(
  settings: WorldSearchSettings,
  requested?: WorldSearchProviderId[],
): WorldSearchProviderId[] {
  return (requested?.length ? requested : (Object.keys(settings.providers) as WorldSearchProviderId[]))
    .filter((id) => settings.providers[id]?.enabled)
}

function dedupeResults(results: WorldSearchResult[]): WorldSearchResult[] {
  const seen = new Set<string>()
  const deduped: WorldSearchResult[] = []
  for (const result of results) {
    const key = result.sourceUrl.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(result)
  }
  return deduped
}

function rankResults(results: WorldSearchResult[], query: string): WorldSearchResult[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  return [...results]
    .map((result) => {
      const haystack =
        `${result.title} ${result.description ?? ''} ${(result.formats ?? []).join(' ')}`.toLowerCase()
      const lexicalBoost = tokens.reduce(
        (boost, token) => (haystack.includes(token) ? boost + 0.05 : boost),
        0,
      )
      const printableBoost =
        PRINT_NATIVE_PROVIDER_IDS.has(result.providerId) ||
        haystack.includes('stl') ||
        haystack.includes('3mf') ||
        haystack.includes('3d print') ||
        haystack.includes('printable')
          ? 0.15
          : 0
      return { ...result, score: result.score + lexicalBoost + printableBoost }
    })
    .sort((a, b) => b.score - a.score)
}

async function runProvider(
  providerId: WorldSearchProviderId,
  settings: WorldSearchSettings,
  query: string,
  limit: number,
  fetchImpl: FetchLike,
): Promise<{ results: WorldSearchResult[]; error?: WorldSearchProviderError }> {
  const runner = PROVIDER_RUNNERS[providerId]
  if (!runner) {
    return {
      results: [],
      error: {
        providerId,
        message: 'Provider is not available.',
      },
    }
  }

  try {
    const results = await runner({
      query,
      limit,
      config: settings.providers[providerId],
      fetchImpl,
    })
    return { results }
  } catch (error) {
    return {
      results: [],
      error: {
        providerId,
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

export async function aggregateWorldSearch(
  settings: WorldSearchSettings,
  searchQuery: WorldSearchQuery,
  fetchImpl: FetchLike = fetch,
): Promise<WorldSearchResponse> {
  const trimmed = searchQuery.query.trim()
  if (!trimmed) {
    return { query: '', results: [], providerErrors: [] }
  }

  const limit = clampLimit(searchQuery.limitPerProvider, settings)
  const providerIds = enabledProviderIds(settings, searchQuery.providerIds)
  if (providerIds.length === 0) {
    return {
      query: trimmed,
      results: [],
      providerErrors: [
        {
          providerId: 'sketchfab',
          message: 'No world search providers are enabled. Enable providers in Settings.',
        },
      ],
    }
  }

  const settled = await Promise.all(
    providerIds.map((providerId) => runProvider(providerId, settings, trimmed, limit, fetchImpl)),
  )

  const providerErrors: WorldSearchProviderError[] = []
  const merged: WorldSearchResult[] = []
  for (const outcome of settled) {
    merged.push(...outcome.results)
    if (outcome.error) {
      providerErrors.push(outcome.error)
    }
  }

  return {
    query: trimmed,
    results: rankResults(dedupeResults(merged), trimmed),
    providerErrors,
  }
}
