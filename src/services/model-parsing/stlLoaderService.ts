import { Group, Mesh, MeshStandardMaterial } from 'three'
import type { BufferGeometry } from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { ModelParseError } from './modelScene'
import type { ModelScene } from './modelScene'

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

function toArrayBuffer(content: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (content instanceof ArrayBuffer) {
    return content
  }
  return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer
}
