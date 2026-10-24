import type { EmbeddingProvider } from './embeddingProvider'
import type { EmbeddingSettings } from '@/types/providerSettings'

/**
 * Renderer-side EmbeddingProvider that forwards to the Electron main
 * process, where the service configured in Settings actually runs
 * (built-in local model or remote API).
 */
export class BridgeEmbeddingProvider implements EmbeddingProvider {
  constructor(
    readonly name: string,
    readonly model: string,
    readonly dimensions: number,
    private readonly settings?: EmbeddingSettings,
  ) {}

  async embedText(text: string): Promise<number[]> {
    if (!window.meshNest) {
      throw new Error('Embedding provider bridge is only available in the desktop app.')
    }
    return window.meshNest.embedText(text, this.settings)
  }
}

/** Builds the bridge provider labeled with the currently active settings. */
export async function createBridgeEmbeddingProvider(
  settings?: EmbeddingSettings,
): Promise<BridgeEmbeddingProvider> {
  if (!window.meshNest) {
    throw new Error('Embedding provider bridge is only available in the desktop app.')
  }
  if (settings) {
    let effective = settings
    if (
      settings.provider === 'builtin' &&
      typeof window.meshNest.isBuiltinEmbeddingAvailable === 'function' &&
      !(await window.meshNest.isBuiltinEmbeddingAvailable())
    ) {
      effective = {
        provider: 'none',
        model: '',
        dimensions: 0,
        useCloud: false,
      }
    }
    return new BridgeEmbeddingProvider(
      effective.provider,
      effective.model,
      effective.dimensions,
      effective,
    )
  }
  const active = await window.meshNest.getActiveEmbeddingProvider()
  return new BridgeEmbeddingProvider(active.name, active.model, active.dimensions)
}
