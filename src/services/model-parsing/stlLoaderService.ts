import { Group, Mesh, MeshStandardMaterial, BufferGeometry, BufferAttribute, Box3, Sphere, Vector3 } from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { ModelParseError } from './modelScene'
import type { ModelScene } from './modelScene'
import ParseWorker from './stlParser.worker?worker'

const DEFAULT_MATERIAL_COLOR = 0x8899aa

/**
 * Parses STL content (binary or ASCII, auto-detected by STLLoader) into
 * the normalized ModelScene representation. STL is treated as
 * geometry-only: no metadata is expected from the file itself.
 *
 * @throws ModelParseError when the content is not a valid STL file.
 */
export function loadStlScene(content: ArrayBuffer | Uint8Array): ModelScene {
  let geometry: BufferGeometry
  try {
    geometry = new STLLoader().parse(toArrayBuffer(content))
  } catch (error) {
    throw new ModelParseError('Failed to parse STL file', error)
  }

  const positions = geometry.getAttribute('position')
  if (!positions || positions.count === 0) {
    throw new ModelParseError('STL file contains no geometry')
  }

  geometry.computeVertexNormals()

  const material = new MeshStandardMaterial({ color: DEFAULT_MATERIAL_COLOR })
  const mesh = new Mesh(geometry, material)
  mesh.name = 'stl-mesh'

  const root = new Group()
  root.name = 'stl-model'
  root.add(mesh)

  return { root, source: 'stl' }
}

export function loadStlSceneAsync(content: ArrayBuffer | Uint8Array): Promise<ModelScene> {
  return new Promise((resolve, reject) => {
    const worker = new ParseWorker()
    const arrayBuffer = toArrayBuffer(content)

    worker.onmessage = (event) => {
      const data = event.data
      worker.terminate()
      if (data.success) {
        const { positions, normals, boundingBox, boundingSphere } = data
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new BufferAttribute(positions, 3))
        geometry.setAttribute('normal', new BufferAttribute(normals, 3))

        if (boundingBox) {
          geometry.boundingBox = new Box3(
            new Vector3(boundingBox.min.x, boundingBox.min.y, boundingBox.min.z),
            new Vector3(boundingBox.max.x, boundingBox.max.y, boundingBox.max.z)
          )
        }
        if (boundingSphere) {
          geometry.boundingSphere = new Sphere(
            new Vector3(boundingSphere.center.x, boundingSphere.center.y, boundingSphere.center.z),
            boundingSphere.radius
          )
        }

        const material = new MeshStandardMaterial({ color: DEFAULT_MATERIAL_COLOR })
        const mesh = new Mesh(geometry, material)
        mesh.name = 'stl-mesh'

        const root = new Group()
        root.name = 'stl-model'
        root.add(mesh)

        resolve({ root, source: 'stl' })
      } else {
        reject(new ModelParseError(data.error || 'Failed to parse STL in worker'))
      }
    }

    worker.onerror = (error) => {
      worker.terminate()
      reject(new ModelParseError('Worker error during STL parsing', error))
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
