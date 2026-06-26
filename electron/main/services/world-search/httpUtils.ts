import type { WorldSearchProviderConfig } from '@/types/worldSearch'

export type FetchLike = typeof fetch

export type ProviderSearchContext = {
  query: string
  limit: number
  config: WorldSearchProviderConfig
  fetchImpl: FetchLike
}

const PRINTABLE_SEARCH_SUFFIX = '3D printable STL 3MF'

/**
 * Broad 3D libraries need an explicit printable bias so meshNest does not
 * drift into game/render assets. Native 3D-print repositories can safely
 * receive the same phrase because their search already centers print files.
 */
export function buildPrintableSearchQuery(query: string): string {
  const trimmed = query.trim()
  if (!trimmed) {
    return PRINTABLE_SEARCH_SUFFIX
  }

  const lower = trimmed.toLowerCase()
  if (
    lower.includes('stl') ||
    lower.includes('3mf') ||
    lower.includes('3d print') ||
    lower.includes('printable')
  ) {
    return trimmed
  }

  return `${trimmed} ${PRINTABLE_SEARCH_SUFFIX}`
}

export async function fetchJson(
  fetchImpl: FetchLike,
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetchImpl(url, init)
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
  }
  if (!text.trim()) {
    return null
  }
  return JSON.parse(text)
}

export async function postJson(
  fetchImpl: FetchLike,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<unknown> {
  return fetchJson(fetchImpl, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

export function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}
