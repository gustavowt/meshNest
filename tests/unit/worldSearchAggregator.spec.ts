import { describe, expect, test, vi } from 'vitest'
import { aggregateWorldSearch } from '../../electron/main/services/world-search/aggregator'
import { DEFAULT_WORLD_SEARCH_SETTINGS } from '@/services/settings/worldSearchSettings'
import type { FetchLike } from '../../electron/main/services/world-search/httpUtils'

function settingsWithSketchfabOnly() {
  const settings = JSON.parse(JSON.stringify(DEFAULT_WORLD_SEARCH_SETTINGS))
  for (const id of Object.keys(settings.providers) as Array<keyof typeof settings.providers>) {
    settings.providers[id].enabled = id === 'sketchfab'
  }
  return settings
}

function settingsWithMainProvidersOnly() {
  const settings = JSON.parse(JSON.stringify(DEFAULT_WORLD_SEARCH_SETTINGS))
  for (const id of Object.keys(settings.providers) as Array<keyof typeof settings.providers>) {
    settings.providers[id].enabled =
      id === 'printables' || id === 'makerworld' || id === 'crealitycloud'
  }
  return settings
}

describe('aggregateWorldSearch', () => {
  test('returns empty results for blank query', async () => {
    const response = await aggregateWorldSearch(settingsWithSketchfabOnly(), { query: '   ' })
    expect(response.results).toEqual([])
    expect(response.providerErrors).toEqual([])
  })

  test('merges sketchfab hits and isolates provider failures', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.includes('sketchfab.com')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                uid: 'abc123',
                name: 'Dragon Stand',
                viewerUrl: 'https://sketchfab.com/3d-models/dragon-stand',
                likeCount: 10,
                isDownloadable: true,
              },
            ],
          }),
          { status: 200 },
        )
      }
      return new Response('fail', { status: 500 })
    }) as FetchLike

    const settings = settingsWithSketchfabOnly()
    settings.providers.printables.enabled = true

    const response = await aggregateWorldSearch(settings, { query: 'dragon stand' }, fetchImpl)

    expect(response.results).toHaveLength(1)
    expect(response.results[0]?.providerId).toBe('sketchfab')
    expect(response.results[0]?.title).toBe('Dragon Stand')
    expect(response.providerErrors.some((error) => error.providerId === 'printables')).toBe(true)
    const sketchfabUrl = String(fetchImpl.mock.calls[0]?.[0])
    expect(new URL(sketchfabUrl).searchParams.get('q')).toBe('dragon stand 3D printable STL 3MF')
    expect(sketchfabUrl).toContain('downloadable=true')
  })

  test('deduplicates results by source url', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              uid: '1',
              name: 'Shared Model',
              viewerUrl: 'https://example.com/model',
              isDownloadable: true,
            },
            {
              uid: '2',
              name: 'Shared Model Duplicate',
              viewerUrl: 'https://example.com/model',
              isDownloadable: true,
            },
          ],
        }),
        { status: 200 },
      ),
    ) as FetchLike

    const response = await aggregateWorldSearch(
      settingsWithSketchfabOnly(),
      { query: 'shared' },
      fetchImpl,
    )

    expect(response.results).toHaveLength(1)
  })

  test('searches main providers and maps Creality Cloud results', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url)
      if (href.includes('printables')) {
        return new Response(
          JSON.stringify({
            data: {
              result: {
                items: [
                  {
                    id: '3161',
                    name: '3D BENCHY',
                    slug: '3d-benchy',
                    likesCount: 10,
                    downloadCount: 20,
                    image: { filePath: 'media/benchy.jpg' },
                    user: { publicUsername: 'Prusa Research' },
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (href.includes('bambulab')) {
        return new Response(
          JSON.stringify({
            hits: [
              {
                id: 40146,
                title: 'Benchy Bambu Pla Basic',
                slug: 'benchy-bambu-pla-basic',
                cover: 'https://makerworld.example/benchy.jpg',
                likeCount: 100,
                downloadCount: 200,
                printCount: 300,
                designCreator: { name: 'Bambu Lab' },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (href.includes('crealitycloud.com/api/cxy/smart_search/v1/model')) {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({
          keyword: 'benchy',
          page: 1,
          pageSize: 12,
        })
        return new Response(
          JSON.stringify({
            code: 0,
            msg: 'success',
            result: {
              list: [
                {
                  id: '68ee121d3a70138cc39b06bd',
                  urlAlias: 'benchy-duck',
                  groupName: 'Duck Benchy',
                  categoryName: 'Test Models',
                  covers: [{ url: 'https://pic2-cdn.creality.com/benchy.webp' }],
                  userInfo: { nickName: 'fifindr' },
                  downloadCount: 2824,
                  likeCount: 602,
                  collectionCount: 829,
                  license: 'CXY-SL',
                  isPay: false,
                  model3mfCount: 2,
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      throw new Error(`Unexpected fetch: ${href}`)
    }) as FetchLike

    const response = await aggregateWorldSearch(
      settingsWithMainProvidersOnly(),
      { query: 'benchy' },
      fetchImpl,
    )

    expect(response.results.map((result) => result.providerId)).toEqual(
      expect.arrayContaining(['printables', 'makerworld', 'crealitycloud']),
    )
    expect(response.providerErrors).toEqual([])
    const crealityResult = response.results.find((result) => result.providerId === 'crealitycloud')
    expect(crealityResult?.sourceUrl).toBe(
      'https://www.crealitycloud.com/model-detail/benchy-duck',
    )
    expect(crealityResult?.title).toBe('Duck Benchy')
    expect(crealityResult?.thumbnailUrl).toBe('https://pic2-cdn.creality.com/benchy.webp')
    expect(crealityResult?.creatorName).toBe('fifindr')
    expect(crealityResult?.downloads).toBe(2824)
    expect(crealityResult?.likes).toBe(602)
    expect(crealityResult?.license).toBe('CXY-SL')
    expect(crealityResult?.priceLabel).toBe('Free')
  })
})
