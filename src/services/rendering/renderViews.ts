import { Vector3 } from 'three'
import type { RenderViewName } from '@/types/modelRender'

export type RenderViewDefinition = {
  viewName: RenderViewName
  /** Camera direction from the model center (not necessarily normalized). */
  direction: Vector3
  /** Camera up vector (needed for the top view). */
  up: Vector3
  width: number
  height: number
}

const VIEW_SIZE = 512
const THUMBNAIL_SIZE = 256
const Y_UP = new Vector3(0, 1, 0)

/**
 * Deterministic camera definitions for every generated view. Order is
 * stable so repeated renders produce the same sequence of images.
 * Directions are expressed in the normalized (Y-up, origin-centered)
 * model space produced by modelNormalizer.
 */
export const RENDER_VIEW_DEFINITIONS: readonly RenderViewDefinition[] = [
  { viewName: 'thumbnail', direction: new Vector3(1, 0.8, 1), up: Y_UP, width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE },
  { viewName: 'front', direction: new Vector3(0, 0, 1), up: Y_UP, width: VIEW_SIZE, height: VIEW_SIZE },
  { viewName: 'back', direction: new Vector3(0, 0, -1), up: Y_UP, width: VIEW_SIZE, height: VIEW_SIZE },
  { viewName: 'left', direction: new Vector3(-1, 0, 0), up: Y_UP, width: VIEW_SIZE, height: VIEW_SIZE },
  { viewName: 'right', direction: new Vector3(1, 0, 0), up: Y_UP, width: VIEW_SIZE, height: VIEW_SIZE },
  { viewName: 'top', direction: new Vector3(0, 1, 0), up: new Vector3(0, 0, -1), width: VIEW_SIZE, height: VIEW_SIZE },
  { viewName: 'perspective', direction: new Vector3(1, 0.8, 1), up: Y_UP, width: VIEW_SIZE, height: VIEW_SIZE },
]
