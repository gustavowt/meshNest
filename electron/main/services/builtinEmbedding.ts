import path from 'node:path'
import { app } from 'electron'
import type { EmbeddingProvider } from '../../../src/services/llm/embeddingProvider'

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
