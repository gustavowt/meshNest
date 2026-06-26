import type { WorldSearchResult } from '@/types/worldSearch'
import type { ProviderSearchContext } from './httpUtils'
import { fetchJson } from './httpUtils'

type ThingiverseHit = {
  id?: number
  name?: string
  url?: string
  public_url?: string
  thumbnail?: string
  preview_image?: string
  creator?: { name?: string }
  like_count?: number
  collect_count?: number
  download_count?: number
  is_premium?: boolean
}

function normalizeHit(hit: ThingiverseHit, index: number): WorldSearchResult | null {
  const sourceId = hit.id !== undefined ? String(hit.id) : null
  if (!sourceId || !hit.name) {
    return null
  }
  const sourceUrl = hit.public_url ?? hit.url ?? `https://www.thingiverse.com/thing:${sourceId}`
  const popularity =
    (hit.like_count ?? 0) + (hit.collect_count ?? 0) * 0.5 + (hit.download_count ?? 0) * 0.25

  return {
    id: `thingiverse:${sourceId}`,
    providerId: 'thingiverse',
    sourceId,
    title: hit.name,
    thumbnailUrl: hit.thumbnail ?? hit.preview_image,
    sourceUrl,
    creatorName: hit.creator?.name,
    priceLabel: hit.is_premium ? 'Premium' : 'Free',
    likes: hit.like_count,
    downloads: hit.download_count,
    formats: ['stl'],
    score: 1 - index * 0.02 + Math.min(popularity / 1000, 0.2),
  }
}

export async function searchThingiverse(ctx: ProviderSearchContext): Promise<WorldSearchResult[]> {
  const token = ctx.config.credentials?.apiToken?.trim()
  if (!token) {
    throw new Error('Thingiverse API token is not configured.')
  }

  const url = new URL('https://www.thingiverse.com/api/v2/search/things')
  url.searchParams.set('page', '1')
  url.searchParams.set('per_page', String(ctx.limit))
  url.searchParams.set('sort', 'relevant')
  url.searchParams.set('term', ctx.query)

  const data = (await fetchJson(ctx.fetchImpl, url.toString(), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      Referer: `https://www.thingiverse.com/search?q=${encodeURIComponent(ctx.query)}&page=1&type=things&sort=relevant`,
      'User-Agent': 'meshNest/1.0',
    },
  })) as
    | ThingiverseHit[]
    | { hits?: ThingiverseHit[]; results?: ThingiverseHit[] }

  const hits = Array.isArray(data)
    ? data
    : (data.hits ?? data.results ?? [])

  return hits
    .map((hit, index) => normalizeHit(hit, index))
    .filter((item): item is WorldSearchResult => item !== null)
}
