import { Box3, Mesh } from 'three'
import type { GeometryMetadata } from '@/types/modelMetadata'
import type { ModelScene } from './modelScene'

/**
 * Extracts geometry metadata from a normalized model scene.
 * Dimensions assume model units are millimeters (the STL/3MF convention).
 *
 * Volume, surface area, and watertightness are intentionally left
 * undefined for now (placeholders for a later phase).
 */
export function extractGeometryMetadata(scene: ModelScene): GeometryMetadata {
  let vertexCount = 0
  let triangleCount = 0
  let meshCount = 0

  scene.root.updateMatrixWorld(true)
  scene.root.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return
    }
    meshCount += 1
    const geometry = object.geometry
    const positions = geometry.getAttribute('position')
    if (!positions) {
      return
    }
    vertexCount += positions.count
    triangleCount += geometry.index ? geometry.index.count / 3 : positions.count / 3
  })

  const boundingBox = new Box3().setFromObject(scene.root)
  const hasBounds = !boundingBox.isEmpty()

  return {
    widthMm: hasBounds ? boundingBox.max.x - boundingBox.min.x : undefined,
    heightMm: hasBounds ? boundingBox.max.y - boundingBox.min.y : undefined,
    depthMm: hasBounds ? boundingBox.max.z - boundingBox.min.z : undefined,
    triangleCount: Math.round(triangleCount),
    vertexCount,
    meshCount,
    objectCount: scene.root.children.length,
    surfaceAreaMm2: undefined,
    volumeMm3: undefined,
    isWatertight: undefined,
  }
}
