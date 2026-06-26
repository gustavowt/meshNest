import type { WorldSearchResult } from '@/types/worldSearch'
import type { ProviderSearchContext } from './httpUtils'
import { buildPrintableSearchQuery, fetchJson } from './httpUtils'

type SketchfabResult = {
  uid?: string
  name?: string
  uri?: string
  viewerUrl?: string
  description?: string
  license?: { label?: string; slug?: string }
  isDownloadable?: boolean
  faceCount?: number
  likeCount?: number
  viewCount?: number
  thumbnails?: { images?: Array<{ url?: string; width?: number }> }
  user?: { displayName?: string; username?: string }
  archives?: { glb?: { size?: number }; gltf?: { size?: number } }
}

function pickThumbnail(result: SketchfabResult): string | undefined {
  const images = result.thumbnails?.images ?? []
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
  return sorted[0]?.url
}

function normalizeResult(result: SketchfabResult, index: number): WorldSearchResult | null {
  const sourceId = result.uid
  if (!sourceId || !result.name) {
    return null
  }
  const sourceUrl = result.viewerUrl ?? `https://sketchfab.com${result.uri ?? `/3d-models/${sourceId}`}`
  const popularity = (result.likeCount ?? 0) + (result.viewCount ?? 0) * 0.05
  const formats = result.isDownloadable ? ['glb', 'gltf'] : undefined
  return {
    id: `sketchfab:${sourceId}`,
    providerId: 'sketchfab',
    sourceId,
    title: result.name,
    description: result.description,
    thumbnailUrl: pickThumbnail(result),
    sourceUrl,
    creatorName: result.user?.displayName ?? result.user?.username,
    license: result.license?.label ?? result.license?.slug,
    likes: result.likeCount,
    formats,
    score: 1 - index * 0.02 + Math.min(popularity / 5000, 0.2),
  }
}

export async function searchSketchfab(ctx: ProviderSearchContext): Promise<WorldSearchResult[]> {
  const url = new URL('https://api.sketchfab.com/v3/search')
  url.searchParams.set('type', 'models')
  url.searchParams.set('q', buildPrintableSearchQuery(ctx.query))
  url.searchParams.set('count', String(Math.min(ctx.limit, 24)))
  url.searchParams.set('downloadable', 'true')
  url.searchParams.set('tags', '3d-printing,stl,3d-printable')

  const token = ctx.config.credentials?.apiToken?.trim()
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Token ${token}`
  }

  const data = (await fetchJson(ctx.fetchImpl, url.toString(), { headers })) as {
    results?: SketchfabResult[]
  }

  return (data.results ?? [])
    .map((item, index) => normalizeResult(item, index))
    .filter((item): item is WorldSearchResult => item !== null)
}
