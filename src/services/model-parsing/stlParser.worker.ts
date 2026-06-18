import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

addEventListener('message', (event: MessageEvent<{ content: ArrayBuffer }>) => {
  const { content } = event.data
  let positionsData: any = null
  let normalsData: any = null

  try {
    const geometry = new STLLoader().parse(content)
    const positionsAttr = geometry.getAttribute('position')
    if (!positionsAttr || positionsAttr.count === 0) {
      throw new Error('STL file contains no geometry')
    }
    geometry.computeVertexNormals()
    const normalsAttr = geometry.getAttribute('normal')

    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()

    positionsData = positionsAttr.array
    normalsData = normalsAttr ? normalsAttr.array : new (self as any).Float32Array(0)

    const bbox = geometry.boundingBox
    const bsphere = geometry.boundingSphere

    const boundingBox = bbox ? {
      min: { x: bbox.min.x, y: bbox.min.y, z: bbox.min.z },
      max: { x: bbox.max.x, y: bbox.max.y, z: bbox.max.z },
    } : null;

    const boundingSphere = bsphere ? {
      center: { x: bsphere.center.x, y: bsphere.center.y, z: bsphere.center.z },
      radius: bsphere.radius,
    } : null;

    (self as any).postMessage(
      {
        success: true,
        positions: positionsData,
        normals: normalsData,
        boundingBox,
        boundingSphere,
      },
      [positionsData.buffer, normalsData.buffer],
    )
  } catch (error) {
    (self as any).postMessage({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})
