import type { WorldSearchResult } from '@/types/worldSearch'
import type { ProviderSearchContext } from './httpUtils'
import { fetchJson } from './httpUtils'

type MakerWorldCreator = {
  name?: string
  handle?: string
  uid?: number | string
}

type MakerWorldHit = {
  id?: number | string
  title?: string
  name?: string
  slug?: string
  cover?: string
  coverUrl?: string
  description?: string
  likeCount?: number
  downloadCount?: number
  rawModelFileDownloadCount?: number
  printCount?: number
  collectionCount?: number
  designCreator?: MakerWorldCreator
  creator?: MakerWorldCreator
  tags?: Array<{ name?: string } | string>
}

function normalizeHit(hit: MakerWorldHit, index: number): WorldSearchResult | null {
  const sourceId = hit.id !== undefined ? String(hit.id) : null
  const title = hit.title ?? hit.name
  if (!sourceId || !title) {
    return null
  }

  const slug = hit.slug ? `-${hit.slug}` : ''
  const sourceUrl = `https://makerworld.com/en/models/${sourceId}${slug}`
  const downloads = hit.downloadCount ?? hit.rawModelFileDownloadCount
  const popularity =
    (hit.likeCount ?? 0) +
    (downloads ?? 0) * 0.35 +
    (hit.printCount ?? 0) * 0.2 +
    (hit.collectionCount ?? 0) * 0.15
  const creator = hit.designCreator ?? hit.creator

  return {
    id: `makerworld:${sourceId}`,
    providerId: 'makerworld',
    sourceId,
    title,
    description: hit.description,
    thumbnailUrl: hit.cover ?? hit.coverUrl,
    sourceUrl,
    creatorName: creator?.name ?? creator?.handle,
    likes: hit.likeCount,
    downloads,
    formats: ['3mf', 'stl'],
    score: 1 - index * 0.02 + Math.min(popularity / 100000, 0.2),
  }
}

/**
 * Provider using MakerWorld/Bambu's search-service metadata endpoint.
 * The endpoint is public today but is not a stable developer API.
 */
export async function searchMakerWorld(ctx: ProviderSearchContext): Promise<WorldSearchResult[]> {
  const url = new URL('https://api.bambulab.com/v1/search-service/select/design2')
  url.searchParams.set('keyword', ctx.query)
  url.searchParams.set('limit', String(Math.min(ctx.limit, 50)))
  url.searchParams.set('offset', '0')
  url.searchParams.set('order_by', 'score')

  const data = (await fetchJson(ctx.fetchImpl, url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'meshNest/1.0',
    },
  })) as { hits?: MakerWorldHit[]; data?: { hits?: MakerWorldHit[] } }

  return (data.hits ?? data.data?.hits ?? [])
    .map((hit, index) => normalizeHit(hit, index))
    .filter((item): item is WorldSearchResult => item !== null)
}
