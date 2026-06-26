import type { WorldSearchResult } from '@/types/worldSearch'
import type { ProviderSearchContext } from './httpUtils'
import { fetchJson } from './httpUtils'

type ThangsMarketplaceInfo = {
  priceInUSD?: number
}

type ThangsSearchItem = {
  modelId?: number | string
  name?: string
  description?: string
  ownerUsername?: string
  downloadCount?: number
  likesCount?: number
  clickCount?: number
  modelPageUrl?: string
  thumbnailUrl?: string
  fileTypes?: string[]
  marketplaceInfo?: ThangsMarketplaceInfo | null
  plans?: unknown[]
}

type ThangsSearchResponse = {
  items?: ThangsSearchItem[]
}

function buildThangsSearchUrl(query: string): string {
  return `https://thangs.com/search/${encodeURIComponent(query)}?scope=all`
}

function buildThangsModelUrl(sourceId: string): string {
  return `https://thangs.com/m/${encodeURIComponent(sourceId)}`
}

function thangsPriceLabel(item: ThangsSearchItem): string {
  const price = item.marketplaceInfo?.priceInUSD
  if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
    return Number.isInteger(price) ? `$${price}` : `$${price.toFixed(2)}`
  }

  if (item.plans?.length) {
    return 'Member'
  }

  return 'Free'
}

function thangsFormats(item: ThangsSearchItem): string[] {
  const normalized = (item.fileTypes ?? [])
    .map((format) => format.toLowerCase())
    .filter((format) => format === 'stl' || format === '3mf')

  return normalized.length > 0 ? Array.from(new Set(normalized)) : ['stl', '3mf']
}

function normalizeThangsItem(item: ThangsSearchItem, index: number): WorldSearchResult | null {
  const sourceId = item.modelId !== undefined ? String(item.modelId) : null
  if (!sourceId || !item.name) {
    return null
  }

  const popularity =
    (item.likesCount ?? 0) +
    (item.downloadCount ?? 0) * 0.35 +
    (item.clickCount ?? 0) * 0.05

  return {
    id: `thangs:${sourceId}`,
    providerId: 'thangs',
    sourceId,
    title: item.name,
    description: item.description,
    thumbnailUrl: item.thumbnailUrl,
    sourceUrl: item.modelPageUrl ?? buildThangsModelUrl(sourceId),
    creatorName: item.ownerUsername,
    priceLabel: thangsPriceLabel(item),
    formats: thangsFormats(item),
    likes: item.likesCount,
    downloads: item.downloadCount,
    score: 1 - index * 0.02 + Math.min(popularity / 10000, 0.2),
  }
}

export async function searchThangs(ctx: ProviderSearchContext): Promise<WorldSearchResult[]> {
  const token = ctx.config.credentials?.apiToken?.trim()
  if (!token) {
    throw new Error('Thangs API token is not configured.')
  }

  const trimmed = ctx.query.trim()
  if (!trimmed) {
    return []
  }

  const url = new URL('https://thangs.com/api/search/v5/search-by-text')
  url.searchParams.set('searchTerm', trimmed)
  url.searchParams.set('page', '0')
  url.searchParams.set('pageSize', String(ctx.limit))
  url.searchParams.set('pageScope', 'root')

  const data = (await fetchJson(ctx.fetchImpl, url.toString(), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      Referer: buildThangsSearchUrl(trimmed),
      'User-Agent': 'meshNest/1.0',
    },
  })) as ThangsSearchResponse

  return (data.items ?? [])
    .map((item, index) => normalizeThangsItem(item, index))
    .filter((item): item is WorldSearchResult => item !== null)
}
