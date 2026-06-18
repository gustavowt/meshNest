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

/** Normalizes a package-internal path so zip keys and `p:path` references compare equal. */
function normalizePath(p: string): string {
  let s = p.trim()
  if (s.startsWith('./')) s = s.slice(2)
  if (s.startsWith('/')) s = s.slice(1)
  return s.toLowerCase()
}

/** Finds the 3D model relationship target declared in `_rels/.rels`. */
function findRootModelTarget(relsXml: string): string | null {
  let pos = 0
  while (true) {
    const start = relsXml.indexOf('<Relationship', pos)
    if (start === -1) break
    const end = relsXml.indexOf('>', start)
    if (end === -1) break
    const tag = relsXml.slice(start, end + 1)
    const type = getAttributeValue(tag, 'Type')
    const target = getAttributeValue(tag, 'Target')
    if (type && target && /3dmodel$/i.test(type)) {
      return target
    }
    pos = end + 1
  }
  return null
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
            path: getAttributeValue(compTag, 'p:path') || undefined,
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
          path: getAttributeValue(itemTag, 'p:path') || undefined,
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

    // Map normalized package paths to their actual zip entry keys so
    // production-extension `p:path` references can be resolved.
    const pathIndex = new Map<string, string>()
    for (const key of Object.keys(files)) {
      pathIndex.set(normalizePath(key), key)
    }
    const resolveZipKey = (p: string): string | undefined => pathIndex.get(normalizePath(p))

    // Resolve the root model part: prefer the _rels declaration, then the
    // conventional path, then any .model entry.
    let rootKey: string | undefined
    const relsKey = pathIndex.get('_rels/.rels')
    if (relsKey) {
      const target = findRootModelTarget(new TextDecoder().decode(files[relsKey]))
      if (target) rootKey = resolveZipKey(target)
    }
    if (!rootKey) rootKey = pathIndex.get('3d/3dmodel.model')
    if (!rootKey) rootKey = Object.keys(files).find((f) => f.toLowerCase().endsWith('.model'))
    if (!rootKey) {
      throw new Error('3MF package does not contain a 3D model part')
    }

    // Object ids are only unique within a single model part, so key every
    // object globally as `<zip path>#<local id>` and rewrite all references.
    const makeKey = (zipKey: string, id: string): string => `${zipKey}#${id}`

    const objects: Record<string, any> = {}
    let buildItems: any[] = []
    const parsedFiles = new Set<string>()

    const parseFile = (zipKey: string): void => {
      if (parsedFiles.has(zipKey) || !files[zipKey]) return
      parsedFiles.add(zipKey)

      const xmlText = new TextDecoder().decode(files[zipKey])
      const { objects: localObjects, buildItems: localBuild } = parseModelXml(xmlText)
      const referenced = new Set<string>()

      for (const obj of Object.values(localObjects)) {
        const components = obj.components
          ? obj.components.map((comp: any) => {
              const targetKey = comp.path ? resolveZipKey(comp.path) : zipKey
              if (targetKey) referenced.add(targetKey)
              return {
                objectId: makeKey(targetKey || zipKey, comp.objectId),
                transform: comp.transform,
              }
            })
          : undefined
        objects[makeKey(zipKey, obj.id)] = {
          id: makeKey(zipKey, obj.id),
          name: obj.name,
          mesh: obj.mesh,
          components,
        }
      }

      // Build items live in the root model and place objects on the plate.
      if (zipKey === rootKey) {
        buildItems = localBuild.map((item: any) => {
          const targetKey = item.path ? resolveZipKey(item.path) : rootKey
          if (targetKey) referenced.add(targetKey)
          return {
            objectId: makeKey(targetKey || (rootKey as string), item.objectId),
            transform: item.transform,
          }
        })
      }

      for (const ref of referenced) parseFile(ref)
    }

    parseFile(rootKey)

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
