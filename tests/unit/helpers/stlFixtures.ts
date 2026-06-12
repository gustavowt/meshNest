export type Triangle = {
  normal: [number, number, number]
  vertices: [[number, number, number], [number, number, number], [number, number, number]]
}

/** Two triangles spanning a 10 x 20 x 30 bounding box. */
export const SPANNING_TRIANGLES: Triangle[] = [
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

export function buildAsciiStl(triangles: Triangle[], name = 'fixture'): string {
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

export function buildBinaryStl(triangles: Triangle[]): ArrayBuffer {
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
  return buffer
}
