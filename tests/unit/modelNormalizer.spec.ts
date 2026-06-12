// Uses jsdom (default) because the 3MF loader needs DOMParser.
import { MathUtils, Vector3 } from 'three'
import { describe, expect, test } from 'vitest'
import {
  computeCameraDistance,
  DEFAULT_CAMERA_FOV_DEGREES,
  getCameraPlacement,
  normalizeModelScene,
} from '@/services/model-parsing/modelNormalizer'
import { loadStlScene } from '@/services/model-parsing/stlLoaderService'
import { loadThreeMfScene } from '@/services/model-parsing/threeMfLoaderService'
import { buildBinaryStl, SPANNING_TRIANGLES } from './helpers/stlFixtures'
import { buildThreeMfPackage } from './helpers/threeMfFixtures'

function loadNormalizedStl() {
  return normalizeModelScene(loadStlScene(buildBinaryStl(SPANNING_TRIANGLES)))
}

describe('normalizeModelScene', () => {
  test('centers the model around the origin', () => {
    const model = loadNormalizedStl()
    const center = model.boundingBox.getCenter(new Vector3())

    expect(center.x).toBeCloseTo(0, 5)
    expect(center.y).toBeCloseTo(0, 5)
    expect(center.z).toBeCloseTo(0, 5)
    expect(model.boundingSphere.center.length()).toBeCloseTo(0, 5)
  })

  test('reorients Z-up models to Y-up while preserving original dimensions', () => {
    const model = loadNormalizedStl()

    // Original STL spans 10 x 20 x 30 (Z-up). After -90deg X rotation the
    // display height (Y) comes from the original Z axis.
    expect(model.originalSize.toArray().map((v) => Math.round(v))).toEqual([10, 20, 30])
    expect(model.size.x).toBeCloseTo(10)
    expect(model.size.y).toBeCloseTo(30)
    expect(model.size.z).toBeCloseTo(20)
    expect(model.maxDimension).toBeCloseTo(30)
  })

  test('does not mutate the source scene transforms or geometry', () => {
    const scene = loadStlScene(buildBinaryStl(SPANNING_TRIANGLES))
    const mesh = scene.root.children[0] as import('three').Mesh
    const originalPositions = Array.from(mesh.geometry.getAttribute('position').array)

    normalizeModelScene(scene)

    expect(scene.root.position.toArray()).toEqual([0, 0, 0])
    expect(scene.root.rotation.x).toBe(0)
    expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(originalPositions)
  })

  test('normalization is deterministic', () => {
    const first = loadNormalizedStl()
    const second = loadNormalizedStl()

    expect(first.boundingBox.min.toArray()).toEqual(second.boundingBox.min.toArray())
    expect(first.boundingBox.max.toArray()).toEqual(second.boundingBox.max.toArray())
    expect(computeCameraDistance(first)).toBe(computeCameraDistance(second))
  })

  test('works for 3MF scenes', () => {
    const model = normalizeModelScene(loadThreeMfScene(buildThreeMfPackage()))
    const center = model.boundingBox.getCenter(new Vector3())

    expect(center.length()).toBeCloseTo(0, 5)
    expect(model.originalSize.toArray().map((v) => Math.round(v))).toEqual([10, 20, 30])
  })
})

describe('camera fitting', () => {
  test('camera distance keeps the bounding sphere fully in frame', () => {
    const model = loadNormalizedStl()
    const distance = computeCameraDistance(model)
    const halfFov = MathUtils.degToRad(DEFAULT_CAMERA_FOV_DEGREES) / 2

    // Visible radius at the model distance must exceed the bounding sphere.
    expect(distance * Math.sin(halfFov)).toBeGreaterThan(model.boundingSphere.radius)
  })

  test('larger models get proportionally larger camera distances', () => {
    const small = loadNormalizedStl()
    const largeTriangles = SPANNING_TRIANGLES.map((t) => ({
      ...t,
      vertices: t.vertices.map((v) => v.map((c) => c * 10)) as typeof t.vertices,
    }))
    const large = normalizeModelScene(loadStlScene(buildBinaryStl(largeTriangles)))

    expect(computeCameraDistance(large) / computeCameraDistance(small)).toBeCloseTo(10, 1)
  })

  test('camera placement frames the model from the requested direction', () => {
    const model = loadNormalizedStl()
    const placement = getCameraPlacement(model, new Vector3(1, 1, 1))

    expect(placement.target.toArray()).toEqual([0, 0, 0])
    expect(placement.position.length()).toBeCloseTo(computeCameraDistance(model), 5)
    expect(placement.near).toBeGreaterThan(0)
    expect(placement.far).toBeGreaterThan(placement.position.length())

    const normalized = placement.position.clone().normalize()
    const expected = new Vector3(1, 1, 1).normalize()
    expect(normalized.distanceTo(expected)).toBeCloseTo(0, 5)
  })
})
