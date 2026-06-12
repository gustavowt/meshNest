export const RENDER_VIEW_NAMES = [
  'thumbnail',
  'front',
  'back',
  'left',
  'right',
  'top',
  'perspective',
] as const

export type RenderViewName = (typeof RENDER_VIEW_NAMES)[number]

/**
 * A rendered PNG image generated for a model file, stored on disk
 * and referenced from the database.
 */
export type ModelRenderAsset = {
  id: string
  modelFileId: string
  viewName: RenderViewName
  absolutePath: string
  width: number
  height: number
  createdAt?: string
}
