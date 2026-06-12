import { validateVisionResponse } from './jsonValidation'
import { SUGGESTED_CATEGORIES } from './prompts'
import type { VisionAnalysisInput, VisionProvider, VisionProviderResult } from './visionProvider'

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
