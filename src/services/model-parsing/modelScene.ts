import type { Object3D } from 'three'

export type ModelSceneSource = 'stl' | '3mf'

/**
 * Normalized internal representation of a loaded model, shared by the
 * preview component, the renderer, and the metadata extractor regardless
 * of the source format.
 */
export type ModelScene = {
  root: Object3D
  source: ModelSceneSource
}

export class ModelParseError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'ModelParseError'
    this.cause = cause
  }
}
