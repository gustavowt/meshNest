import { createVisionProvider } from '../../../../src/services/llm/visionProviderFactory'
import type { FetchLike } from '../../../../src/services/llm/httpVisionProvider'
import type { AppLanguage, VisionSettings } from '../../../../src/types/providerSettings'
import type { ImageSearchQuery, WorldSearchSettings } from '../../../../src/types/worldSearch'
import { DEFAULT_WORLD_SEARCH_SETTINGS } from '../../../../src/services/settings/worldSearchSettings'
import { researchImageOnWeb } from './imageWebResearch'

export async function describeImageQuery(
  imageBase64Png: string,
  visionSettings: VisionSettings,
  language?: AppLanguage,
  worldSearchSettings: WorldSearchSettings = DEFAULT_WORLD_SEARCH_SETTINGS,
  fetchImpl: FetchLike = fetch,
): Promise<ImageSearchQuery> {
  if (visionSettings.provider === 'none') {
    throw new Error('Enable a Vision AI provider in Settings to search by image.')
  }

  const webResearch = await researchImageOnWeb(
    imageBase64Png,
    worldSearchSettings.imageResearch,
    fetchImpl,
  )
  const provider = createVisionProvider(visionSettings, fetchImpl)
  return provider.analyzeImageForSearch(
    [
      {
        viewName: 'thumbnail',
        base64Png: imageBase64Png,
      },
    ],
    language,
    webResearch,
  )
}
