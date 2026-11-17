// Uses the default jsdom environment: ThreeMFLoader needs DOMParser.
import { Color, Mesh, MeshPhongMaterial } from 'three'
import { strToU8 } from 'fflate'
import { describe, expect, test } from 'vitest'
import { extractGeometryMetadata } from '@/services/model-parsing/geometryMetadata'
import { ModelParseError } from '@/services/model-parsing/modelScene'
import { buildWorkerObject, loadThreeMfScene } from '@/services/model-parsing/threeMfLoaderService'
import { parseModelXml, parseVertices } from '@/services/model-parsing/threeMfParser.worker'
import { buildModelXml, buildThreeMfPackage } from './helpers/threeMfFixtures'

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

  test('worker parser carries basic material color information', () => {
    const parsed = parseModelXml(buildModelXml({ includeMaterial: true }))
    const object = parsed.objects['2']

    expect(object.mesh.materialColor).toBe('#FF0000')
    expect(new Color(object.mesh.materialColor).getHex()).toBe(new Color(1, 0, 0).getHex())
  })

  test('worker parser reads triangle material references', () => {
    const xml = buildModelXml({ includeMaterial: true })
      .replace(' pid="1" pindex="0"', '')
      .replace('<triangle v1="0" v2="2" v3="1"/>', '<triangle v1="0" v2="2" v3="1" pid="1" p1="0"/>')

    const parsed = parseModelXml(xml)

    expect(parsed.objects['2'].mesh.materialColor).toBe('#FF0000')
  })

  test('worker parser reads namespaced color groups', () => {
    const xml = buildModelXml()
      .replace('<resources>', '<resources><m:colorgroup id="7"><m:color color="#00FF00FF"/></m:colorgroup>')
      .replace('<object id="2" type="model">', '<object id="2" type="model" pid="7" pindex="0">')

    const parsed = parseModelXml(xml)

    expect(parsed.objects['2'].mesh.materialColor).toBe('#00FF00')
  })

  test('rejects invalid 3MF content with a controlled error', () => {
    expect(() => loadThreeMfScene(strToU8('not a zip'))).toThrow(ModelParseError)
  })

  test('buildWorkerObject preserves materialColor and sets metadata', () => {
    const obj = {
      id: '1',
      name: 'part-1',
      mesh: {
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]),
        indices: new Uint32Array([0, 1, 2]),
        materialColor: '#00AE42',
      },
    }
    const node = buildWorkerObject(obj, { '1': obj }) as Mesh
    expect(node).toBeInstanceOf(Mesh)
    expect(node.userData.hasFileColor).toBe(true)
    expect(node.userData.originalColor).toBe('#00AE42')
    const mat = node.material as any
    expect(mat.roughness).toBe(0.35)
    expect(mat.metalness).toBe(0.05)
  })

  test('buildWorkerObject cycles assembly colors across multi-part meshes lacking materialColor', () => {
    const context = { meshIndex: 0, fallbackColor: '#FF6A00' }
    const obj1 = {
      id: '1',
      mesh: {
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]),
        indices: new Uint32Array([0, 1, 2]),
      },
    }
    const obj2 = {
      id: '2',
      mesh: {
        positions: new Float32Array([0, 0, 0, 2, 0, 0, 2, 2, 0]),
        indices: new Uint32Array([0, 1, 2]),
      },
    }

    const node1 = buildWorkerObject(obj1, {}, context) as Mesh
    expect(node1.userData.hasFileColor).toBe(false)
    expect(node1.userData.originalColor).toBe('#FF6A00') // partIndex 0

    const node2 = buildWorkerObject(obj2, {}, context) as Mesh
    expect(node2.userData.hasFileColor).toBe(false)
    expect(node2.userData.originalColor).not.toBe('#FF6A00') // partIndex 1 offset
    expect(context.meshIndex).toBe(2)
  })

  test('parseVertices handles out-of-order XML attributes and varied whitespace', () => {
    const xml = `
      <vertex y="2.5" z="3.5" x="1.5"/>
      <vertex   z="30"  x="10"   y="20"   />
    `
    const positions = parseVertices(xml)
    expect(positions).toHaveLength(6)
    expect(positions[0]).toBeCloseTo(1.5)
    expect(positions[1]).toBeCloseTo(2.5)
    expect(positions[2]).toBeCloseTo(3.5)
    expect(positions[3]).toBeCloseTo(10)
    expect(positions[4]).toBeCloseTo(20)
    expect(positions[5]).toBeCloseTo(30)
  })

  test('buildWorkerObject handles self-referencing component cycles cleanly without crashing', () => {
    const selfRefObj = {
      id: 'self-1',
      name: 'self-referential',
      components: [
        { objectId: 'self-1' },
      ],
    }
    const objects = { 'self-1': selfRefObj }

    expect(() => {
      const node = buildWorkerObject(selfRefObj, objects)
      expect(node).toBeDefined()
      expect(node.children).toHaveLength(0)
    }).not.toThrow()
  })

  test('buildWorkerObject handles indirect component cycles (A -> B -> A) cleanly', () => {
    const objA = {
      id: 'A',
      name: 'node-A',
      components: [{ objectId: 'B' }],
    }
    const objB = {
      id: 'B',
      name: 'node-B',
      components: [{ objectId: 'A' }],
    }
    const objects = { A: objA, B: objB }

    expect(() => {
      const node = buildWorkerObject(objA, objects)
      expect(node).toBeDefined()
      expect(node.children).toHaveLength(1)
      expect(node.children[0].children).toHaveLength(0)
    }).not.toThrow()
  })
})
