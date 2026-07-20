import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'

const samplesDir = join(dirname(fileURLToPath(import.meta.url)), '../samples')

/** Subdivided 30 mm cube (~768 triangles) for realistic STL parsing. */
function buildSubdividedBoxTriangles(size = 30, divisions = 8) {
  const triangles = []
  const step = size / divisions

  function addQuad(a, b, c, d) {
    triangles.push({ normal: faceNormal(a, b, c), vertices: [a, b, c] })
    triangles.push({ normal: faceNormal(a, c, d), vertices: [a, c, d] })
  }

  function faceNormal(a, b, c) {
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const vz = c[2] - a[2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    return [nx / len, ny / len, nz / len]
  }

  function gridFace(uAxis, vAxis, fixedAxis, fixedValue, flip) {
    for (let i = 0; i < divisions; i += 1) {
      for (let j = 0; j < divisions; j += 1) {
        const p = (idxU, idxV) => {
          const point = [0, 0, 0]
          point[uAxis] = idxU * step
          point[vAxis] = idxV * step
          point[fixedAxis] = fixedValue
          return point
        }
        const a = p(i, j)
        const b = p(i + 1, j)
        const c = p(i + 1, j + 1)
        const d = p(i, j + 1)
        if (flip) {
          addQuad(a, c, b, d)
        } else {
          addQuad(a, b, c, d)
        }
      }
    }
  }

  gridFace(0, 1, 2, 0, false)
  gridFace(0, 1, 2, size, true)
  gridFace(0, 2, 1, 0, true)
  gridFace(0, 2, 1, size, false)
  gridFace(1, 2, 0, 0, false)
  gridFace(1, 2, 0, size, true)

  return triangles
}

/** 32-sided cylinder (~128 side triangles + caps). */
function buildCylinderTriangles(radius = 12, height = 40, segments = 32) {
  const triangles = []
  const bottom = [0, 0, 0]
  const top = [0, 0, height]

  function pushTriangle(normal, v1, v2, v3) {
    triangles.push({ normal, vertices: [v1, v2, v3] })
  }

  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    const p0 = [radius * Math.cos(a0), radius * Math.sin(a0), 0]
    const p1 = [radius * Math.cos(a1), radius * Math.sin(a1), 0]
    const p2 = [radius * Math.cos(a1), radius * Math.sin(a1), height]
    const p3 = [radius * Math.cos(a0), radius * Math.sin(a0), height]
    const nx = Math.cos((a0 + a1) / 2)
    const ny = Math.sin((a0 + a1) / 2)
    const sideNormal = [nx, ny, 0]
    pushTriangle(sideNormal, p0, p1, p2)
    pushTriangle(sideNormal, p0, p2, p3)
    pushTriangle([0, 0, -1], bottom, p1, p0)
    pushTriangle([0, 0, 1], top, p3, p2)
  }

  return triangles
}

function buildAsciiStl(triangles, name) {
  const lines = [`solid ${name}`]
  for (const triangle of triangles) {
    lines.push(`  facet normal ${triangle.normal.join(' ')}`)
    lines.push('    outer loop')
    for (const vertex of triangle.vertices) {
      lines.push(`      vertex ${vertex.map((v) => v.toFixed(6)).join(' ')}`)
    }
    lines.push('    endloop')
    lines.push('  endfacet')
  }
  lines.push(`endsolid ${name}`)
  return lines.join('\n')
}

function buildBinaryStl(triangles) {
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

function meshXmlFromTriangles(triangles, origin = [0, 0, 0]) {
  const [ox, oy, oz] = origin
  const vertexMap = new Map()
  const vertexList = []

  function vertexIndex(point) {
    const key = point.map((v) => v.toFixed(4)).join(',')
    if (!vertexMap.has(key)) {
      vertexMap.set(key, vertexList.length)
      vertexList.push(point)
    }
    return vertexMap.get(key)
  }

  const triangleXml = triangles
    .map((triangle) => {
      const indices = triangle.vertices.map(([x, y, z]) =>
        vertexIndex([x + ox, y + oy, z + oz]),
      )
      return `<triangle v1="${indices[0]}" v2="${indices[1]}" v3="${indices[2]}"/>`
    })
    .join('')

  const verticesXml = vertexList
    .map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`)
    .join('')

  return `<mesh><vertices>${verticesXml}</vertices><triangles>${triangleXml}</triangles></mesh>`
}

function cubeMesh(origin, size) {
  const [ox, oy, oz] = origin
  const vertices = [
    [ox, oy, oz],
    [ox + size, oy, oz],
    [ox + size, oy + size, oz],
    [ox, oy + size, oz],
    [ox, oy, oz + size],
    [ox + size, oy, oz + size],
    [ox + size, oy + size, oz + size],
    [ox, oy + size, oz + size],
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

// 64x64 red PNG preview (~400 bytes compressed in zip).
const THUMBNAIL_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAI0lEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAOA1Y7AAAb0a6ksAAAAASUVORK5CYII=',
  ),
  (c) => c.charCodeAt(0),
)

function buildStorageBoxThreeMf(bodyMesh, lidMesh) {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="png" ContentType="image/png"/>
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
  <Relationship Target="/Metadata/thumbnail.png" Id="rel1" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>
</Relationships>`

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
  xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <metadata name="Title">Storage Box with Lid</metadata>
  <metadata name="Designer">meshNest Samples</metadata>
  <metadata name="Description">Two-part storage box for App Review — body and lid with PLA colors.</metadata>
  <resources>
    <basematerials id="1">
      <base name="Red PLA" displaycolor="#E53935FF"/>
      <base name="Blue PLA" displaycolor="#1E88E5FF"/>
    </basematerials>
    <object id="2" type="model" name="Box Body" pid="1" pindex="0">${bodyMesh}</object>
    <object id="3" type="model" name="Box Lid" pid="1" pindex="1">${lidMesh}</object>
  </resources>
  <build>
    <item objectid="2"/>
    <item objectid="3" transform="1 0 0 0 1 0 0 0 1 0 0 45"/>
  </build>
</model>`

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(model),
    'Metadata/thumbnail.png': THUMBNAIL_PNG,
  })
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
  <metadata name="Title">Simple Cube</metadata>
  <resources>
    <object id="2" type="model" name="Simple Cube">${cubeMesh([0, 0, 0], 20)}</object>
  </resources>
  <build><item objectid="2"/></build>
</model>`

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(model),
  })
}

const boxTriangles = buildSubdividedBoxTriangles()
const cylinderTriangles = buildCylinderTriangles()
const bodyMesh = meshXmlFromTriangles(buildSubdividedBoxTriangles(40, 6))
const lidMesh = meshXmlFromTriangles(buildSubdividedBoxTriangles(42, 6))

mkdirSync(samplesDir, { recursive: true })
writeFileSync(join(samplesDir, 'sample-box.stl'), buildAsciiStl(boxTriangles, 'sample-box'))
writeFileSync(join(samplesDir, 'sample-box-binary.stl'), buildBinaryStl(boxTriangles))
writeFileSync(join(samplesDir, 'sample-cylinder.stl'), buildAsciiStl(cylinderTriangles, 'sample-cylinder'))
writeFileSync(join(samplesDir, 'storage-box-with-lid.3mf'), buildStorageBoxThreeMf(bodyMesh, lidMesh))
writeFileSync(join(samplesDir, 'simple-cube.3mf'), buildSimpleThreeMf())

console.log('Wrote samples to', samplesDir)
console.log(
  'Triangles:',
  `box=${boxTriangles.length}`,
  `cylinder=${cylinderTriangles.length}`,
)
