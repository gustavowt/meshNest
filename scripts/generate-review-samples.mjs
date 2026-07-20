import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'

const samplesDir = join(dirname(fileURLToPath(import.meta.url)), '../samples')

const triangles = [
  {
    normal: [0, 0, 1],
    vertices: [
      [0, 0, 0],
      [10, 0, 0],
      [10, 20, 0],
    ],
  },
  {
    normal: [0, 0, 1],
    vertices: [
      [0, 0, 30],
      [10, 0, 30],
      [0, 20, 30],
    ],
  },
]

function buildAsciiStl(name) {
  const lines = [`solid ${name}`]
  for (const triangle of triangles) {
    lines.push(`  facet normal ${triangle.normal.join(' ')}`)
    lines.push('    outer loop')
    for (const vertex of triangle.vertices) {
      lines.push(`      vertex ${vertex.join(' ')}`)
    }
    lines.push('    endloop')
    lines.push('  endfacet')
  }
  lines.push(`endsolid ${name}`)
  return lines.join('\n')
}

function buildBinaryStl() {
  const buffer = new ArrayBuffer(84 + triangles.length * 50)
  const view = new DataView(buffer)
  view.setUint32(80, triangles.length, true)

  let offset = 84
  for (const triangle of triangles) {
    for (const value of triangle.normal) {
      view.setFloat32(offset, value, true)
      offset += 4
    }
    for (const vertex of triangle.vertices) {
      for (const value of vertex) {
        view.setFloat32(offset, value, true)
        offset += 4
      }
    }
    view.setUint16(offset, 0, true)
    offset += 2
  }
  return Buffer.from(buffer)
}

function cubeMesh() {
  const vertices = [
    [0, 0, 0],
    [10, 0, 0],
    [10, 20, 0],
    [0, 20, 0],
    [0, 0, 30],
    [10, 0, 30],
    [10, 20, 30],
    [0, 20, 30],
  ]
    .map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`)
    .join('')

  const faces = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
  ]
    .map(([v1, v2, v3]) => `<triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`)
    .join('')

  return `<mesh><vertices>${vertices}</vertices><triangles>${faces}</triangles></mesh>`
}

function buildSimpleThreeMf() {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">Sample Cube</metadata>
  <resources>
    <object id="2" type="model" name="Sample Cube">${cubeMesh()}</object>
  </resources>
  <build><item objectid="2"/></build>
</model>`

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(model),
  })
}

mkdirSync(samplesDir, { recursive: true })
writeFileSync(join(samplesDir, 'box.stl'), buildAsciiStl('box'))
writeFileSync(join(samplesDir, 'box-binary.stl'), buildBinaryStl())
writeFileSync(join(samplesDir, 'simple.3mf'), buildSimpleThreeMf())

console.log('Wrote samples to', samplesDir)
