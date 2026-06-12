// Uses the default jsdom environment: ThreeMFLoader needs DOMParser.
import { Color, Mesh, MeshPhongMaterial } from 'three'
import { strToU8 } from 'fflate'
import { describe, expect, test } from 'vitest'
import { extractGeometryMetadata } from '@/services/model-parsing/geometryMetadata'
import { ModelParseError } from '@/services/model-parsing/modelScene'
import { loadThreeMfScene } from '@/services/model-parsing/threeMfLoaderService'
import { buildThreeMfPackage } from './helpers/threeMfFixtures'

function countMeshes(scene: ReturnType<typeof loadThreeMfScene>): number {
  let count = 0
  scene.root.traverse((object) => {
    if (object instanceof Mesh) {
      count += 1
    }
  })
  return count
}

describe('threeMfLoaderService', () => {
  test('loads a standard 3MF file into a normalized scene', () => {
    const scene = loadThreeMfScene(buildThreeMfPackage({ objectName: 'Cube' }))

    expect(scene.source).toBe('3mf')
    expect(countMeshes(scene)).toBe(1)
  })

  test('extracts geometry metadata from a loaded 3MF scene', () => {
    const scene = loadThreeMfScene(buildThreeMfPackage())
    const metadata = extractGeometryMetadata(scene)

    expect(metadata.widthMm).toBeCloseTo(10)
    expect(metadata.heightMm).toBeCloseTo(20)
    expect(metadata.depthMm).toBeCloseTo(30)
    expect(metadata.triangleCount).toBe(12)
    expect(metadata.meshCount).toBe(1)
  })

  test('handles 3MF files with multiple objects', () => {
    const scene = loadThreeMfScene(buildThreeMfPackage({ objectName: 'Body', secondObjectName: 'Lid' }))
    const metadata = extractGeometryMetadata(scene)

    expect(countMeshes(scene)).toBe(2)
    expect(metadata.triangleCount).toBe(24)
    // Second cube is translated +20 on X, so the combined width spans 30.
    expect(metadata.widthMm).toBeCloseTo(30)
  })

  test('preserves basic material color information', () => {
    const scene = loadThreeMfScene(buildThreeMfPackage({ includeMaterial: true }))

    let material: MeshPhongMaterial | undefined
    scene.root.traverse((object) => {
      if (object instanceof Mesh && !material) {
        material = object.material as MeshPhongMaterial
      }
    })

    expect(material).toBeDefined()
    // displaycolor #FF0000FF should map to red.
    const expected = new Color(1, 0, 0)
    expect(material!.color.getHex()).toBe(expected.getHex())
  })

  test('rejects invalid 3MF content with a controlled error', () => {
    expect(() => loadThreeMfScene(strToU8('not a zip'))).toThrow(ModelParseError)
  })
})
