import type { WorldSearchResult } from '@/types/worldSearch'
import type { ProviderSearchContext } from './httpUtils'
import { postJson } from './httpUtils'

type CrealityCloudCover = {
  url?: string
}

type CrealityCloudUser = {
  nickName?: string
}

type CrealityCloudModel = {
  id?: string
  urlAlias?: string
  groupName?: string
  categoryName?: string
  covers?: CrealityCloudCover[]
  userInfo?: CrealityCloudUser
  downloadCount?: number
  likeCount?: number
  collectionCount?: number
  license?: string
  isPay?: boolean
  model3mfCount?: number
}

type CrealityCloudSearchResponse = {
  code?: number
  msg?: string
  result?: {
    list?: CrealityCloudModel[]
  } | null
}

export function buildCrealityCloudSearchUrl(query: string): string {
  const url = new URL('https://www.crealitycloud.com/search')
  url.searchParams.set('keyword', query)
  return url.toString()
}

function buildCrealityCloudModelUrl(model: CrealityCloudModel): string {
  const pathId = model.urlAlias || model.id || ''
  return `https://www.crealitycloud.com/model-detail/${encodeURIComponent(pathId)}`
}

function crealityPriceLabel(model: CrealityCloudModel): string {
  return model.isPay ? 'Paid' : 'Free'
}

function crealityFormats(model: CrealityCloudModel): string[] {
  return model.model3mfCount && model.model3mfCount > 0 ? ['3mf', 'stl'] : ['stl']
}

function normalizeCrealityModel(model: CrealityCloudModel, index: number): WorldSearchResult | null {
  if (!model.id || !model.groupName) {
    return null
  }

  const popularity =
    (model.likeCount ?? 0) +
    (model.downloadCount ?? 0) * 0.35 +
    (model.collectionCount ?? 0) * 0.15

  return {
    id: `crealitycloud:${model.id}`,
    providerId: 'crealitycloud',
    sourceId: model.id,
    title: model.groupName,
    description: model.categoryName
      ? `${model.categoryName} model on Creality Cloud.`
      : 'Model on Creality Cloud.',
    thumbnailUrl: model.covers?.[0]?.url,
    sourceUrl: buildCrealityCloudModelUrl(model),
    creatorName: model.userInfo?.nickName,
    license: model.license,
    priceLabel: crealityPriceLabel(model),
    formats: crealityFormats(model),
    likes: model.likeCount,
    downloads: model.downloadCount,
    score: 1 - index * 0.02 + Math.min(popularity / 10000, 0.2),
  }
}

/**
 * Provider using Creality Cloud's smart search metadata endpoint.
 * The endpoint is public today but is not a documented developer API.
 */
export async function searchCrealityCloud(ctx: ProviderSearchContext): Promise<WorldSearchResult[]> {
  const trimmed = ctx.query.trim()
  if (!trimmed) {
    return []
  }

  const data = (await postJson(
    ctx.fetchImpl,
    'https://www.crealitycloud.com/api/cxy/smart_search/v1/model',
    {
      keyword: trimmed,
      page: 1,
      pageSize: ctx.limit,
    },
    {
      Accept: 'application/json',
      Origin: 'https://www.crealitycloud.com',
      Referer: buildCrealityCloudSearchUrl(trimmed),
      'User-Agent': 'meshNest/1.0',
    },
  )) as CrealityCloudSearchResponse

  if (data.code !== undefined && data.code !== 0) {
    throw new Error(data.msg || 'Creality Cloud search failed.')
  }

  return (data.result?.list ?? [])
    .map((model, index) => normalizeCrealityModel(model, index))
    .filter((item): item is WorldSearchResult => item !== null)
}
