import type { EmbeddingProvider } from './embeddingProvider'

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
  ) {}

  async embedText(text: string): Promise<number[]> {
    if (!window.meshNest) {
      throw new Error('Embedding provider bridge is only available in the desktop app.')
    }
    return window.meshNest.embedText(text)
  }
}

/** Builds the bridge provider labeled with the currently active settings. */
export async function createBridgeEmbeddingProvider(): Promise<BridgeEmbeddingProvider> {
  if (!window.meshNest) {
    throw new Error('Embedding provider bridge is only available in the desktop app.')
  }
  const active = await window.meshNest.getActiveEmbeddingProvider()
  return new BridgeEmbeddingProvider(active.name, active.model, active.dimensions)
}
