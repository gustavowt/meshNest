import type {
  NameNormalizationInput,
  NameNormalizationResult,
  VisionAnalysisInput,
  VisionProvider,
  VisionProviderResult,
} from './visionProvider'
import type { VisionSettings } from '@/types/providerSettings'

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
    return window.meshNest.normalizeName(rawName, context)
  }

  async normalizeNames(items: NameNormalizationInput[]): Promise<NameNormalizationResult[]> {
    if (!window.meshNest) {
      throw new Error('Vision provider bridge is only available in the desktop app.')
    }
    return window.meshNest.normalizeNames(items)
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
