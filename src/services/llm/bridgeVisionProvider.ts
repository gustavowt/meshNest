import type { VisionAnalysisInput, VisionProvider, VisionProviderResult } from './visionProvider'

/**
 * Renderer-side VisionProvider that forwards to the Electron main
 * process, where the provider configured in Settings actually runs
 * (keeping API keys out of the renderer).
 */
export class BridgeVisionProvider implements VisionProvider {
  constructor(
    readonly name: string,
    readonly model: string,
  ) {}

  async describeModel(input: VisionAnalysisInput): Promise<VisionProviderResult> {
    if (!window.meshNest) {
      throw new Error('Vision provider bridge is only available in the desktop app.')
    }
    return window.meshNest.describeModel(input)
  }

  async normalizeName(rawName: string, context?: string): Promise<string> {
    if (!window.meshNest) {
      throw new Error('Vision provider bridge is only available in the desktop app.')
    }
    return window.meshNest.normalizeName(rawName, context)
  }
}

/** Builds the bridge provider labeled with the currently active settings. */
export async function createBridgeVisionProvider(): Promise<BridgeVisionProvider> {
  if (!window.meshNest) {
    throw new Error('Vision provider bridge is only available in the desktop app.')
  }
  const active = await window.meshNest.getActiveVisionProvider()
  return new BridgeVisionProvider(active.name, active.model)
}
