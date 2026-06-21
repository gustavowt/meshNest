import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'
import {
  DEFAULT_CAMERA_FOV_DEGREES,
  getCameraPlacement,
} from '@/services/model-parsing/modelNormalizer'
import type { NormalizedModel } from '@/services/model-parsing/modelNormalizer'
import { RENDER_VIEW_DEFINITIONS } from './renderViews'
import type { RenderViewName } from '@/types/modelRender'

export type RenderedView = {
  viewName: RenderViewName
  png: Uint8Array
  width: number
  height: number
}

export type RenderOptions = {
  /** Solid hex background (e.g. '#f1f2f4') or 'transparent'. */
  background?: string
}

const DEFAULT_BACKGROUND = 'transparent'

/**
 * Renders every defined view of a normalized model into PNG bytes using
 * an offscreen canvas. Camera placement, lighting, and background are
 * fully deterministic so repeated renders of the same file produce
 * repeatable images for the vision LLM.
 *
 * Requires a WebGL-capable context (Electron renderer). The
 * implementation is isolated here so the host context can change later.
 */
export function renderModelViews(model: NormalizedModel, options: RenderOptions = {}): RenderedView[] {
  const background = options.background ?? DEFAULT_BACKGROUND
  const canvas = document.createElement('canvas')
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(1)

  const scene = new Scene()
  if (background !== 'transparent') {
    scene.background = new Color(background)
  }
  scene.add(new AmbientLight(0xffffff, 0.65))
  const keyLight = new DirectionalLight(0xffffff, 1.8)
  scene.add(keyLight)
  scene.add(model.root)

  const results: RenderedView[] = []
  try {
    for (const view of RENDER_VIEW_DEFINITIONS) {
      const placement = getCameraPlacement(model, view.direction)
      const camera = new PerspectiveCamera(
        DEFAULT_CAMERA_FOV_DEGREES,
        view.width / view.height,
        placement.near,
        placement.far,
      )
      camera.up.copy(view.up)
      camera.position.copy(placement.position)
      camera.lookAt(placement.target)

      // The key light follows the camera so every view is evenly lit.
      keyLight.position.copy(placement.position)

      renderer.setSize(view.width, view.height, false)
      renderer.render(scene, camera)

      results.push({
        viewName: view.viewName,
        png: dataUrlToBytes(canvas.toDataURL('image/png')),
        width: view.width,
        height: view.height,
      })
    }
  } finally {
    scene.remove(model.root)
    renderer.dispose()
  }
  return results
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Non-blocking variant of {@link renderModelViews}: yields to the browser
 * before each per-view render and encodes PNGs asynchronously via
 * `canvas.toBlob`, so rendering a heavy model no longer freezes the UI.
 * Output is identical (same camera/lighting/views) to the synchronous
 * version.
 */
export async function renderModelViewsAsync(
  model: NormalizedModel,
  options: RenderOptions = {},
): Promise<RenderedView[]> {
  const background = options.background ?? DEFAULT_BACKGROUND
  const canvas = document.createElement('canvas')
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(1)

  const scene = new Scene()
  if (background !== 'transparent') {
    scene.background = new Color(background)
  }
  scene.add(new AmbientLight(0xffffff, 0.65))
  const keyLight = new DirectionalLight(0xffffff, 1.8)
  scene.add(keyLight)
  scene.add(model.root)

  const results: RenderedView[] = []
  try {
    for (const view of RENDER_VIEW_DEFINITIONS) {
      // Let the UI paint between the heavy per-view renders.
      await nextFrame()

      const placement = getCameraPlacement(model, view.direction)
      const camera = new PerspectiveCamera(
        DEFAULT_CAMERA_FOV_DEGREES,
        view.width / view.height,
        placement.near,
        placement.far,
      )
      camera.up.copy(view.up)
      camera.position.copy(placement.position)
      camera.lookAt(placement.target)

      keyLight.position.copy(placement.position)

      renderer.setSize(view.width, view.height, false)
      renderer.render(scene, camera)

      results.push({
        viewName: view.viewName,
        png: await canvasToPngBytes(canvas),
        width: view.width,
        height: view.height,
      })
    }
  } finally {
    scene.remove(model.root)
    renderer.dispose()
  }
  return results
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
    } else {
      setTimeout(resolve, 0)
    }
  })
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode render to PNG'))
        return
      }
      blob
        .arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(reject)
    }, 'image/png')
  })
}
