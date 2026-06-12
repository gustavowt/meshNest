import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { unzipSync, strToU8, zipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import { z } from 'zod'

describe('Phase 1 dependencies', () => {
  test('three.js core is importable', () => {
    expect(THREE.REVISION).toBeTruthy()
    expect(new THREE.Scene()).toBeInstanceOf(THREE.Object3D)
  })

  test('STL and 3MF loaders are importable', () => {
    expect(new STLLoader()).toBeInstanceOf(THREE.Loader)
    expect(new ThreeMFLoader()).toBeInstanceOf(THREE.Loader)
  })

  test('fflate can zip and unzip in memory', () => {
    const zipped = zipSync({ 'hello.txt': strToU8('mesh-nest') })
    const unzipped = unzipSync(zipped)
    expect(new TextDecoder().decode(unzipped['hello.txt'])).toBe('mesh-nest')
  })

  test('fast-xml-parser parses XML', () => {
    const parser = new XMLParser({ ignoreAttributes: false })
    const result = parser.parse('<model unit="millimeter"><resources/></model>')
    expect(result.model['@_unit']).toBe('millimeter')
  })

  test('zod validates schemas', () => {
    const schema = z.object({ confidence: z.number().min(0).max(1) })
    expect(schema.safeParse({ confidence: 0.8 }).success).toBe(true)
    expect(schema.safeParse({ confidence: 2 }).success).toBe(false)
  })
})
