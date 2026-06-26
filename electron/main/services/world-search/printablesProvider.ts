import type { WorldSearchResult } from '@/types/worldSearch'
import type { ProviderSearchContext } from './httpUtils'
import { postJson } from './httpUtils'

type PrintablesModel = {
  id?: number | string
  name?: string
  slug?: string
  likesCount?: number
  downloadCount?: number
  ratingAvg?: number
  image?: { filePath?: string }
  user?: { handle?: string; publicUsername?: string }
}

const SEARCH_QUERY = `
query SearchModels($query: String!, $limit: Int, $ordering: SearchChoicesEnum) {
  result: searchPrints2(query: $query, printType: print, limit: $limit, ordering: $ordering) {
    items {
      id
      name
      slug
      likesCount
      downloadCount
      ratingAvg
      image { filePath }
      user { handle publicUsername }
    }
  }
}
`

function thumbnailUrl(filePath?: string): string | undefined {
  if (!filePath) {
    return undefined
  }
  if (filePath.startsWith('http')) {
    return filePath
  }
  return `https://media.printables.com${filePath.startsWith('/') ? '' : '/'}${filePath}`
}

function normalizeModel(item: PrintablesModel, index: number): WorldSearchResult | null {
  const sourceId = item.id !== undefined ? String(item.id) : null
  if (!sourceId || !item.name) {
    return null
  }
  const slugPart = item.slug ? `-${item.slug}` : ''
  const sourceUrl = `https://www.printables.com/model/${sourceId}${slugPart}`
  const popularity = (item.likesCount ?? 0) + (item.downloadCount ?? 0) * 0.5
  return {
    id: `printables:${sourceId}`,
    providerId: 'printables',
    sourceId,
    title: item.name,
    thumbnailUrl: thumbnailUrl(item.image?.filePath),
    sourceUrl,
    creatorName: item.user?.publicUsername ?? item.user?.handle,
    likes: item.likesCount,
    downloads: item.downloadCount,
    formats: ['stl', '3mf'],
    score: 1 - index * 0.02 + Math.min(popularity / 1000, 0.2),
  }
}

/** Provider using Printables public GraphQL search metadata. */
export async function searchPrintables(ctx: ProviderSearchContext): Promise<WorldSearchResult[]> {
  const data = (await postJson(ctx.fetchImpl, 'https://api.printables.com/graphql/', {
    operationName: 'SearchModels',
    query: SEARCH_QUERY,
    variables: { query: ctx.query, limit: ctx.limit, ordering: 'best_match' },
  }, {
    'User-Agent': 'meshNest/1.0',
  })) as { data?: { result?: { items?: PrintablesModel[] } }; errors?: Array<{ message?: string }> }

  if (data.errors?.length) {
    throw new Error(data.errors.map((error) => error.message).filter(Boolean).join('; '))
  }

  return (data.data?.result?.items ?? [])
    .map((item, index) => normalizeModel(item, index))
    .filter((item): item is WorldSearchResult => item !== null)
}
