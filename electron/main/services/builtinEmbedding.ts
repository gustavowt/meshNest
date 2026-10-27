import path from 'node:path'
import { createRequire } from 'node:module'
import { app } from 'electron'
import type { EmbeddingProvider } from '../../../src/services/llm/embeddingProvider'

export type BuiltinEmbeddingProbeResult = {
  available: boolean
  reason?: string
}

let cachedProbeResult: BuiltinEmbeddingProbeResult | null = null

/**
 * Attempts to load the onnxruntime-node native binding once lazily.
 * On macOS < 13.3 or any platform missing required symbols, dlopen fails.
 * Captures the reason and caches the result without downloading models.
 */
export function probeBuiltinEmbedding(): BuiltinEmbeddingProbeResult {
  if (cachedProbeResult !== null) {
    return cachedProbeResult
  }

  try {
    const req = createRequire(import.meta.url)
    let ortPath: string | undefined
    try {
      ortPath = req.resolve('onnxruntime-node')
    } catch {
      try {
        const tfPath = req.resolve('@huggingface/transformers')
        ortPath = req.resolve('onnxruntime-node', { paths: [tfPath] })
      } catch {
        // unable to resolve transformers either
      }
    }

    if (!ortPath) {
      cachedProbeResult = {
        available: false,
        reason: 'onnxruntime-node binding could not be resolved.',
      }
      return cachedProbeResult
    }

    req(ortPath)
    cachedProbeResult = { available: true }
  } catch (error) {
    cachedProbeResult = {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
    }
  }

  return cachedProbeResult
}

export function isBuiltinEmbeddingAvailable(): boolean {
  return probeBuiltinEmbedding().available
}

export function getBuiltinEmbeddingProbeResult(): BuiltinEmbeddingProbeResult {
  return probeBuiltinEmbedding()
}

/** Test-only helper to inject a fake probe result without triggering native dlopen. */
export function setBuiltinEmbeddingAvailableForTests(
  available: boolean | null,
  reason?: string,
): void {
  if (available === null) {
    cachedProbeResult = null
  } else {
    cachedProbeResult = { available, reason }
  }
}

type FeatureExtractor = (
  text: string,
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>

const pipelines = new Map<string, Promise<FeatureExtractor>>()

/**
 * Loads (and caches) a transformers.js feature-extraction pipeline for
 * the given Hugging Face model. The ONNX weights are downloaded on
 * first use into userData/hf-models and reused offline afterwards.
 */
function getPipeline(model: string): Promise<FeatureExtractor> {
  let pipelinePromise = pipelines.get(model)
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const transformers = await import('@huggingface/transformers')
      transformers.env.cacheDir = path.join(app.getPath('userData'), 'hf-models')
      const extractor = await transformers.pipeline('feature-extraction', model)
      return extractor as unknown as FeatureExtractor
    })()
    pipelines.set(model, pipelinePromise)
  }
  return pipelinePromise
}

/**
 * Default embedding service: a local sentence-transformer model running
 * fully offline in the Electron main process via transformers.js.
 */
export class BuiltinEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'builtin'

  constructor(
    readonly model: string,
    readonly dimensions: number,
  ) {}

  async embedText(text: string): Promise<number[]> {
    if (!isBuiltinEmbeddingAvailable()) {
      const probe = getBuiltinEmbeddingProbeResult()
      throw new Error(
        `Built-in embedding model is unavailable: ${probe.reason ?? 'failed to load onnxruntime binding'}.`,
      )
    }
    const extractor = await getPipeline(this.model)
    const output = await extractor(text, { pooling: 'mean', normalize: true })
    const values = Array.from(output.data)
    if (values.length !== this.dimensions) {
      throw new Error(
        `Built-in model "${this.model}" produced ${values.length} dimensions ` +
          `but the settings expect ${this.dimensions}. Update the dimensions in Settings.`,
      )
    }
    return values
  }
}
