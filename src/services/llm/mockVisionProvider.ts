import { validateImageSearchQuery, validateVisionResponse } from './jsonValidation'
import { SUGGESTED_CATEGORIES } from './prompts'
import type {
  NameNormalizationInput,
  NameNormalizationResult,
  VisionAnalysisInput,
  VisionProvider,
  VisionProviderResult,
} from './visionProvider'
import type { VisionImageInput } from '@/types/llm'
import type { ImageSearchQuery } from '@/types/worldSearch'

/**
 * Deterministic development provider: derives a plausible structured
 * description purely from the filename and extension, so the full
 * indexing pipeline can run without any real AI service. The same
 * input always produces the same output.
 */
export class MockVisionProvider implements VisionProvider {
  readonly name = 'mock'
  readonly model = 'mock-vision-1'

  async describeModel(input: VisionAnalysisInput): Promise<VisionProviderResult> {
    const baseName = input.filename.replace(/\.[^.]+$/, '')
    const words = baseName
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((word) => word.toLowerCase())

    const category = SUGGESTED_CATEGORIES[hashString(baseName) % SUGGESTED_CATEGORIES.length]
    const shortName = words.length > 0 ? words.join(' ') : baseName || 'unnamed model'

    const dimensions =
      input.geometry?.widthMm !== undefined
        ? ` around ${round1(input.geometry.widthMm)}x${round1(input.geometry.heightMm ?? 0)}x${round1(input.geometry.depthMm ?? 0)} mm`
        : ''

    const objectNames = input.packageMetadata?.objectNames ?? []

    const description = {
      shortName,
      description:
        `Mock description of a 3D printable ${input.extension.toUpperCase()} model named "${shortName}"${dimensions}, ` +
        `derived from ${input.images.length} rendered view(s).`,
      likelyCategory: category,
      tags: [...new Set([...words, input.extension])],
      objectsDetected: objectNames.length > 0 ? objectNames : [shortName],
      printUse: `general ${category} printing`,
      style: 'unknown',
      confidence: 0.5,
      searchPhrases: [shortName, `${category} ${shortName}`, `3d printed ${shortName}`],
    }

    const rawResponseJson = JSON.stringify(description)
    return {
      description: validateVisionResponse(rawResponseJson),
      rawResponseJson,
    }
  }

  async normalizeName(rawName: string): Promise<string> {
    const baseName = rawName.replace(/\.[^.]+$/, '')
    const titled = baseName
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
    return titled || 'Unnamed Model'
  }

  async normalizeNames(items: NameNormalizationInput[]): Promise<NameNormalizationResult[]> {
    return Promise.all(
      items.map(async (item) => ({
        id: item.id,
        normalizedName: await this.normalizeName(item.rawName),
      })),
    )
  }

  async analyzeImageForSearch(images: VisionImageInput[]): Promise<ImageSearchQuery> {
    void images
    const payload = {
      query: 'phone stand organizer',
      tags: ['phone', 'stand', 'desk', 'organizer'],
      category: 'utility',
    }
    return validateImageSearchQuery(payload)
  }
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
