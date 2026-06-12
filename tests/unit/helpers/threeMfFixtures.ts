import { strToU8, zipSync } from 'fflate'

export type ThreeMfFixtureOptions = {
  objectName?: string
  secondObjectName?: string
  includeMaterial?: boolean
  includeThumbnail?: boolean
  includeTitle?: boolean
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="png" ContentType="image/png"/>
</Types>`

// Minimal 1x1 transparent PNG.
const PNG_BYTES = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

function cubeMesh(): string {
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

  const triangles = [
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

  return `<mesh><vertices>${vertices}</vertices><triangles>${triangles}</triangles></mesh>`
}

export function buildModelXml(options: ThreeMfFixtureOptions = {}): string {
  const material = options.includeMaterial
    ? '<basematerials id="1"><base name="Red PLA" displaycolor="#FF0000FF"/></basematerials>'
    : ''
  const materialRef = options.includeMaterial ? ' pid="1" pindex="0"' : ''
  const title = options.includeTitle ? '<metadata name="Title">Test Cube</metadata>' : ''
  const nameAttr = options.objectName ? ` name="${options.objectName}"` : ''

  const secondObject = options.secondObjectName
    ? `<object id="3" type="model" name="${options.secondObjectName}">${cubeMesh()}</object>`
    : ''
  const secondItem = options.secondObjectName
    ? '<item objectid="3" transform="1 0 0 0 1 0 0 0 1 20 0 0"/>'
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
  xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  ${title}
  <resources>
    ${material}
    <object id="2" type="model"${nameAttr}${materialRef}>${cubeMesh()}</object>
    ${secondObject}
  </resources>
  <build><item objectid="2"/>${secondItem}</build>
</model>`
}

/** Builds a valid in-memory .3mf (ZIP) package for tests. */
export function buildThreeMfPackage(options: ThreeMfFixtureOptions = {}): Uint8Array {
  const thumbnailRelationship = options.includeThumbnail
    ? '<Relationship Target="/Metadata/thumbnail.png" Id="rel1" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>'
    : ''

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
  ${thumbnailRelationship}
</Relationships>`

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(buildModelXml(options)),
  }
  if (options.includeThumbnail) {
    files['Metadata/thumbnail.png'] = PNG_BYTES
  }
  return zipSync(files)
}
