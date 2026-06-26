import type {
  NameNormalizationInput,
  NameNormalizationResult,
  VisionAnalysisInput,
  VisionProvider,
  VisionProviderResult,
} from './visionProvider'
import type { VisionImageInput } from '@/types/llm'
import type { VisionSettings } from '@/types/providerSettings'
import type { ImageSearchQuery } from '@/types/worldSearch'

/**
 * Renderer-side VisionProvider that forwards to the Electron main
 * process, where the provider configured in Settings actually runs
 * (keeping API keys out of the renderer).
 */
export class BridgeVisionProvider implements VisionProvider {
  constructor(
    readonly name: string,
    readonly model: string,
    private readonly settings?: VisionSettings,
  ) {}

  async describeModel(input: VisionAnalysisInput): Promise<VisionProviderResult> {
    if (!window.meshNest) {
      throw new Error('Vision provider bridge is only available in the desktop app.')
    }
    return window.meshNest.describeModel(input, this.settings)
  }

  async normalizeName(rawName: string, context?: string): Promise<string> {
    if (!window.meshNest) {
      throw new Error('Vision provider bridge is only available in the desktop app.')
    }
    return window.meshNest.normalizeName(rawName, context, this.settings)
  }

  async normalizeNames(items: NameNormalizationInput[]): Promise<NameNormalizationResult[]> {
    if (!window.meshNest) {
      throw new Error('Vision provider bridge is only available in the desktop app.')
    }
    return window.meshNest.normalizeNames(items, this.settings)
  }

  async analyzeImageForSearch(
    images: VisionImageInput[],
  ): Promise<ImageSearchQuery> {
    if (!window.meshNest) {
      throw new Error('Vision provider bridge is only available in the desktop app.')
    }
    const image = images[0]
    if (!image) {
      throw new Error('At least one image is required for image search.')
    }
    return window.meshNest.describeImageWorldSearchQuery(image.base64Png)
  }
}

/** Builds the bridge provider labeled with the currently active settings. */
export async function createBridgeVisionProvider(
  settings?: VisionSettings,
): Promise<BridgeVisionProvider> {
  if (!window.meshNest) {
    throw new Error('Vision provider bridge is only available in the desktop app.')
  }
  if (settings) {
    return new BridgeVisionProvider(settings.provider, settings.model, settings)
  }
  const active = await window.meshNest.getActiveVisionProvider()
  return new BridgeVisionProvider(active.name, active.model)
}
