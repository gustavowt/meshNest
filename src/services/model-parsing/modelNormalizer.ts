import { Box3, Group, MathUtils, Sphere, Vector3 } from 'three'
import type { ModelScene } from './modelScene'

/**
 * A model scene wrapped for consistent display: deterministically oriented,
 * centered around the origin, with precomputed bounds.
 *
 * The source scene object is added as a child of `root`; its own transforms
 * and geometry are never mutated, so normalization is fully reversible.
 */
export type NormalizedModel = {
  root: Group
  /** Bounding box of the normalized (oriented + centered) model. */
  boundingBox: Box3
  /** Bounding sphere of the normalized model, centered at the origin. */
  boundingSphere: Sphere
  /** Dimensions of the normalized model. */
  size: Vector3
  /** Largest dimension of the normalized model. */
  maxDimension: number
  /** Original (pre-orientation) dimensions, preserved for metadata. */
  originalSize: Vector3
}

export const DEFAULT_CAMERA_FOV_DEGREES = 45
const CAMERA_FIT_MARGIN = 1.4

/**
 * Normalizes a loaded STL/3MF scene for previews and deterministic renders:
 *
 * 1. Applies the 3D-printing convention (Z-up) to the Three.js display
 *    convention (Y-up) by rotating -90 degrees around X.
 * 2. Centers the result around the origin.
 *
 * Both steps are applied to a wrapper group, never to the source geometry.
 */
export function normalizeModelScene(scene: ModelScene): NormalizedModel {
  const originalBox = new Box3().setFromObject(scene.root)
  const originalSize = originalBox.isEmpty() ? new Vector3() : originalBox.getSize(new Vector3())

  const root = new Group()
  root.name = 'normalized-model'
  root.add(scene.root)
  root.rotation.x = -Math.PI / 2
  root.updateMatrixWorld(true)

  const orientedBox = new Box3().setFromObject(root)
  if (!orientedBox.isEmpty()) {
    const center = orientedBox.getCenter(new Vector3())
    root.position.sub(center)
    root.updateMatrixWorld(true)
  }

  const boundingBox = new Box3().setFromObject(root)
  const size = boundingBox.isEmpty() ? new Vector3() : boundingBox.getSize(new Vector3())
  const boundingSphere = boundingBox.isEmpty()
    ? new Sphere(new Vector3(), 0)
    : boundingBox.getBoundingSphere(new Sphere())

  return {
    root,
    boundingBox,
    boundingSphere,
    size,
    maxDimension: Math.max(size.x, size.y, size.z),
    originalSize,
  }
}

/**
 * Camera distance that keeps the whole bounding sphere in frame for the
 * given vertical field of view, with a safety margin so tall or wide
 * models are not cropped.
 */
export function computeCameraDistance(
  model: NormalizedModel,
  fovDegrees: number = DEFAULT_CAMERA_FOV_DEGREES,
): number {
  const radius = Math.max(model.boundingSphere.radius, 1e-6)
  return (radius * CAMERA_FIT_MARGIN) / Math.sin(MathUtils.degToRad(fovDegrees) / 2)
}

export type CameraPlacement = {
  position: Vector3
  target: Vector3
  near: number
  far: number
}

/**
 * Deterministic camera placement that frames the normalized model from
 * the given direction (does not need to be normalized).
 */
export function getCameraPlacement(
  model: NormalizedModel,
  direction: Vector3,
  fovDegrees: number = DEFAULT_CAMERA_FOV_DEGREES,
): CameraPlacement {
  const distance = computeCameraDistance(model, fovDegrees)
  const position = direction.clone().normalize().multiplyScalar(distance)
  return {
    position,
    target: new Vector3(0, 0, 0),
    near: Math.max(distance / 100, 0.01),
    far: distance * 10,
  }
}
