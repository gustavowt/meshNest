/* eslint-disable no-constant-condition */
import { unzipSync } from 'fflate'

function getAttributeValue(tag: string, attrName: string): string | null {
  const regex = new RegExp(`\\b${attrName}\\s*=\\s*["']([^"']*)["']`, 'i')
  const match = regex.exec(tag)
  return match ? match[1] : null
}

function parseTransform(transformStr: string | null): number[] | undefined {
  if (!transformStr) return undefined
  const parts = transformStr.trim().split(/\s+/).map(Number)
  if (parts.length !== 12) return undefined
  return [
    parts[0], parts[1], parts[2], 0,
    parts[3], parts[4], parts[5], 0,
    parts[6], parts[7], parts[8], 0,
    parts[9], parts[10], parts[11], 1
  ]
}

function parseVertices(verticesXml: string): Float32Array {
  let count = 0
  let idx = 0
  while (true) {
    idx = verticesXml.indexOf('<vertex', idx)
    if (idx === -1) break
    count++
    idx += 7
  }

  const positions = new Float32Array(count * 3)
  const regex = /<vertex\s+x=["']([^"']+)["']\s+y=["']([^"']+)["']\s+z=["']([^"']+)["']/gi
  let match
  let pos = 0
  while ((match = regex.exec(verticesXml)) !== null) {
    if (pos >= positions.length) break
    positions[pos++] = parseFloat(match[1])
    positions[pos++] = parseFloat(match[2])
    positions[pos++] = parseFloat(match[3])
  }
  return positions
}

function parseTriangles(trianglesXml: string): Uint32Array {
  let count = 0
  let idx = 0
  while (true) {
    idx = trianglesXml.indexOf('<triangle', idx)
    if (idx === -1) break
    count++
    idx += 9
  }

  const indices = new Uint32Array(count * 3)
  const regex = /<triangle\s+v1=["']([^"']+)["']\s+v2=["']([^"']+)["']\s+v3=["']([^"']+)["']/gi
  let match
  let pos = 0
  while ((match = regex.exec(trianglesXml)) !== null) {
    if (pos >= indices.length) break
    indices[pos++] = parseInt(match[1], 10)
    indices[pos++] = parseInt(match[2], 10)
    indices[pos++] = parseInt(match[3], 10)
  }
  return indices
}

function parseModelXml(xmlText: string) {
  const objects: Record<string, any> = {}
  const buildItems: any[] = []

  let pos = 0
  while (true) {
    const objectStart = xmlText.indexOf('<object', pos)
    if (objectStart === -1) break
    const objectEnd = xmlText.indexOf('</object>', objectStart)
    if (objectEnd === -1) break

    const objectHeader = xmlText.slice(objectStart, xmlText.indexOf('>', objectStart) + 1)
    const id = getAttributeValue(objectHeader, 'id')
    if (id) {
      const name = getAttributeValue(objectHeader, 'name')
      const objectContent = xmlText.slice(objectStart, objectEnd)

      // Check for mesh
      const meshStart = objectContent.indexOf('<mesh>')
      let meshData: any = null
      if (meshStart !== -1) {
        const verticesStart = objectContent.indexOf('<vertices>', meshStart)
        const verticesEnd = objectContent.indexOf('</vertices>', verticesStart)
        const trianglesStart = objectContent.indexOf('<triangles>', meshStart)
        const trianglesEnd = objectContent.indexOf('</triangles>', trianglesStart)

        if (verticesStart !== -1 && verticesEnd !== -1 && trianglesStart !== -1 && trianglesEnd !== -1) {
          const verticesXml = objectContent.slice(verticesStart, verticesEnd)
          const trianglesXml = objectContent.slice(trianglesStart, trianglesEnd)

          const positions = parseVertices(verticesXml)
          const indices = parseTriangles(trianglesXml)
          meshData = { positions, indices }
        }
      }

      // Check for components
      const components: any[] = []
      let compPos = 0
      while (true) {
        const compStart = objectContent.indexOf('<component', compPos)
        if (compStart === -1) break
        const compEnd = objectContent.indexOf('>', compStart)
        if (compEnd === -1) break
        const compTag = objectContent.slice(compStart, compEnd + 1)
        const objectid = getAttributeValue(compTag, 'objectid')
        if (objectid) {
          components.push({
            objectId: objectid,
            transform: parseTransform(getAttributeValue(compTag, 'transform'))
          })
        }
        compPos = compEnd
      }

      objects[id] = {
        id,
        name: name || undefined,
        mesh: meshData,
        components: components.length > 0 ? components : undefined
      }
    }
    pos = objectEnd + 9
  }

  // Scan for build items
  const buildStart = xmlText.indexOf('<build')
  if (buildStart !== -1) {
    let itemPos = buildStart
    while (true) {
      const itemStart = xmlText.indexOf('<item', itemPos)
      if (itemStart === -1) break
      const itemEnd = xmlText.indexOf('>', itemStart)
      if (itemEnd === -1) break
      const itemTag = xmlText.slice(itemStart, itemEnd + 1)
      const objectid = getAttributeValue(itemTag, 'objectid')
      if (objectid) {
        buildItems.push({
          objectId: objectid,
          transform: parseTransform(getAttributeValue(itemTag, 'transform'))
        })
      }
      itemPos = itemEnd
    }
  }

  return { objects, buildItems }
}

addEventListener('message', (event: MessageEvent<{ content: ArrayBuffer }>) => {
  const { content } = event.data
  const globalSelf = self as any
  try {
    const files = unzipSync(new Uint8Array(content))
    const modelPath = Object.keys(files).find(f => f.toLowerCase().endsWith('.model'))
    if (!modelPath) {
      throw new Error('3MF package does not contain a 3D model part')
    }

    const xmlText = new TextDecoder().decode(files[modelPath])
    const { objects, buildItems } = parseModelXml(xmlText)

    // Gather transferables
    const transferables: ArrayBuffer[] = []
    for (const obj of Object.values(objects)) {
      if (obj.mesh) {
        transferables.push(obj.mesh.positions.buffer, obj.mesh.indices.buffer)
      }
    }

    globalSelf.postMessage({ success: true, objects, buildItems }, transferables)
  } catch (error) {
    globalSelf.postMessage({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})
