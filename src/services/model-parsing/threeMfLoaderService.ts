import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import type { Object3D } from 'three'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { getAssemblyPaletteColor } from '@/services/rendering/filamentColors'
import { ModelParseError } from './modelScene'
import type { ModelScene } from './modelScene'
import ParseWorker from './threeMfParser.worker?worker'

const DEFAULT_MATERIAL_COLOR = 0x8899aa

type WorkerComponent = { objectId: string; transform?: number[] }
type WorkerObject = {
  id: string
  name?: string
  mesh?: { positions: Float32Array; indices: Uint32Array; materialColor?: string }
  components?: WorkerComponent[]
}

type BuildContext = {
  meshIndex: number
  fallbackColor?: string | number
}

const MAX_COMPONENT_DEPTH = 64

/**
 * Rebuilds a single parsed 3MF object (mesh leaf or a group of transformed
 * component references) into a Three.js node. Components are resolved
 * recursively against the full object map.
 */
export function buildWorkerObject(
  obj: WorkerObject,
  objects: Record<string, WorkerObject>,
  context: BuildContext = { meshIndex: 0 },
  visited: Set<string> = new Set(),
): Object3D {
  if (visited.has(obj.id) || visited.size >= MAX_COMPONENT_DEPTH) {
    const fallback = new Group()
    fallback.name = obj.name || `object-${obj.id}`
    return fallback
  }

  if (obj.mesh) {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(obj.mesh.positions, 3))
    if (obj.mesh.indices && obj.mesh.indices.length > 0) {
      geometry.setIndex(new BufferAttribute(obj.mesh.indices, 1))
    }
    geometry.computeVertexNormals()

    const hasFileColor = Boolean(obj.mesh.materialColor)
    const baseColor = typeof context.fallbackColor === 'string' ? context.fallbackColor : (context.fallbackColor ?? DEFAULT_MATERIAL_COLOR)
    const color = obj.mesh.materialColor ?? getAssemblyPaletteColor(baseColor, context.meshIndex++)
    const material = new MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.05,
    })
    const mesh = new Mesh(geometry, material)
    mesh.name = obj.name || `object-${obj.id}`
    mesh.userData.hasFileColor = hasFileColor
    mesh.userData.originalColor = color
    return mesh
  }

  const group = new Group()
  group.name = obj.name || `object-${obj.id}`
  const nextVisited = new Set(visited)
  nextVisited.add(obj.id)

  for (const component of obj.components ?? []) {
    if (nextVisited.has(component.objectId)) {
      continue
    }
    const child = objects[component.objectId]
    if (!child) continue
    const node = buildWorkerObject(child, objects, context, nextVisited)
    if (component.transform && component.transform.length === 16) {
      node.applyMatrix4(new Matrix4().fromArray(component.transform))
    }
    group.add(node)
  }
  return group
}

/**
 * Loads 3MF content into the normalized ModelScene representation using
 * the Three.js ThreeMFLoader. Basic material/color information from the
 * package is preserved by the loader. Unsupported 3MF features are
 * reported by the loader as console warnings, never as fatal errors.
 *
 * Requires a DOM context (renderer process or jsdom) because the loader
 * parses model XML with DOMParser.
 *
 * @throws ModelParseError when the content cannot be loaded as 3MF.
 */
export function loadThreeMfScene(content: ArrayBuffer | Uint8Array): ModelScene {
  let root: Group
  try {
    root = new ThreeMFLoader().parse(toArrayBuffer(content))
  } catch (error) {
    throw new ModelParseError('Failed to parse 3MF file', error)
  }

  let meshCount = 0
  root.traverse((object) => {
    if (object instanceof Mesh) {
      meshCount += 1
      if (!object.userData.originalColor && object.material && 'color' in object.material) {
        object.userData.originalColor = object.material.color.getHex()
      }
    }
  })
  if (meshCount === 0) {
    throw new ModelParseError('3MF file contains no mesh geometry')
  }

  root.name = root.name || '3mf-model'
  return { root, source: '3mf' }
}

/**
 * Parses 3MF content asynchronously in a background Web Worker.
 *
 * @throws ModelParseError when the content cannot be loaded as 3MF.
 */
export function loadThreeMfSceneAsync(
  content: ArrayBuffer | Uint8Array,
  fallbackColor?: string | number,
): Promise<ModelScene> {
  return new Promise((resolve, reject) => {
    const worker = new ParseWorker()
    const arrayBuffer = toArrayBuffer(content)

    worker.onmessage = (event) => {
      const data = event.data
      worker.terminate()
      if (!data.success) {
        reject(new ModelParseError(data.error || 'Failed to parse 3MF in worker'))
        return
      }

      try {
        const objects = (data.objects ?? {}) as Record<string, WorkerObject>
        const buildItems = (data.buildItems ?? []) as WorkerComponent[]

        const root = new Group()
        root.name = '3mf-model'

        // Prefer the build plate items; fall back to every renderable object
        // when a package omits the <build> section.
        const items: WorkerComponent[] = buildItems.length > 0
          ? buildItems
          : Object.values(objects)
              .filter((obj) => obj.mesh || (obj.components && obj.components.length > 0))
              .map((obj) => ({ objectId: obj.id }))

        const context: BuildContext = { meshIndex: 0, fallbackColor }
        for (const item of items) {
          const obj = objects[item.objectId]
          if (!obj) continue
          const node = buildWorkerObject(obj, objects, context)
          if (item.transform && item.transform.length === 16) {
            node.applyMatrix4(new Matrix4().fromArray(item.transform))
          }
          root.add(node)
        }

        let meshCount = 0
        root.traverse((object) => {
          if (object instanceof Mesh) meshCount += 1
        })
        if (meshCount === 0) {
          reject(new ModelParseError('3MF file contains no mesh geometry'))
          return
        }

        resolve({ root, source: '3mf' })
      } catch (error) {
        reject(new ModelParseError('Failed to reconstruct 3D scene from worker data', error))
      }
    }

    worker.onerror = (error) => {
      worker.terminate()
      reject(new ModelParseError('Worker error during 3MF parsing', error))
    }

    worker.postMessage({ content: arrayBuffer }, [arrayBuffer])
  })
}

function toArrayBuffer(content: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (content instanceof ArrayBuffer) {
    return content
  }
  return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer
}
