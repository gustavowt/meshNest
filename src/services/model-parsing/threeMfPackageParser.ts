import { unzipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import type { ThreeMfPackageMetadata } from '@/types/modelMetadata'
import { ModelParseError } from './modelScene'

const MODEL_RELATIONSHIP_TYPE = 'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel'
const THUMBNAIL_RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail'
const DEFAULT_MODEL_PATH = '3D/3dmodel.model'

const decoder = new TextDecoder()

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
})

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

function normalizeZipPath(target: string): string {
  return target.startsWith('/') ? target.slice(1) : target
}

type Relationship = { type: string; target: string }

function parseRelationships(files: Record<string, Uint8Array>): Relationship[] {
  const relsFile = files['_rels/.rels']
  if (!relsFile) {
    return []
  }
  const parsed = xmlParser.parse(decoder.decode(relsFile))
  return ensureArray(parsed?.Relationships?.Relationship).map((rel: Record<string, string>) => ({
    type: rel['@_Type'] ?? '',
    target: normalizeZipPath(rel['@_Target'] ?? ''),
  }))
}

/**
 * Parses a .3mf file as a ZIP/XML package and extracts semantic metadata
 * (object names, materials, colors, thumbnails) without loading the 3D
 * scene. Fully independent from the Three.js ThreeMFLoader.
 *
 * Missing optional metadata never fails parsing; only a broken package
 * (invalid ZIP or missing 3D model part) throws ModelParseError.
 */
export function parseThreeMfPackage(content: Uint8Array): ThreeMfPackageMetadata {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(content)
  } catch (error) {
    throw new ModelParseError('3MF file is not a valid ZIP package', error)
  }

  const hasContentTypes = Boolean(files['[Content_Types].xml'])
  const relationships = parseRelationships(files)

  const modelPath =
    relationships.find((rel) => rel.type === MODEL_RELATIONSHIP_TYPE)?.target ??
    (files[DEFAULT_MODEL_PATH] ? DEFAULT_MODEL_PATH : undefined)

  if (!modelPath || !files[modelPath]) {
    throw new ModelParseError('3MF package does not contain a 3D model part')
  }

  let model: Record<string, unknown>
  try {
    const parsed = xmlParser.parse(decoder.decode(files[modelPath]))
    model = (parsed?.model ?? {}) as Record<string, unknown>
  } catch (error) {
    throw new ModelParseError('3MF model XML is malformed', error)
  }

  const resources = (model.resources ?? {}) as Record<string, unknown>

  const objectNames = ensureArray(resources.object as Record<string, string>[])
    .map((object) => object['@_name'])
    .filter((name): name is string => Boolean(name))

  const baseMaterials = ensureArray(resources.basematerials as Record<string, unknown>[]).flatMap(
    (group) => ensureArray(group.base as Record<string, string>[]),
  )
  const materialNames = baseMaterials
    .map((base) => base['@_name'])
    .filter((name): name is string => Boolean(name))

  const colorValues = [
    ...baseMaterials.map((base) => base['@_displaycolor']),
    ...ensureArray(resources['m:colorgroup'] as Record<string, unknown>[]).flatMap((group) =>
      ensureArray(group['m:color'] as Record<string, string>[]).map((color) => color['@_color']),
    ),
  ].filter((color): color is string => Boolean(color))

  const thumbnailFromRels = relationships.find((rel) => rel.type === THUMBNAIL_RELATIONSHIP_TYPE)?.target
  const thumbnailFromModel = (model['@_thumbnail'] as string | undefined)?.replace(/^\//, '')
  const thumbnailInternalPath = [thumbnailFromRels, thumbnailFromModel].find(
    (candidate) => candidate && files[candidate],
  )

  const documentMetadata = ensureArray(model.metadata as Array<Record<string, unknown> | string>)
    .map((entry) =>
      typeof entry === 'string'
        ? { name: undefined, value: entry }
        : { name: entry['@_name'] as string | undefined, value: entry['#text'] },
    )
    .filter((entry) => entry.name || entry.value !== undefined)

  const rawMetadataJson = JSON.stringify({
    modelPath,
    unit: model['@_unit'],
    hasContentTypes,
    documentMetadata,
    objectNames,
    materialNames,
    colorValues,
    thumbnailInternalPath,
  })

  return {
    objectNames,
    materialNames,
    colorValues: [...new Set(colorValues)],
    hasThumbnail: Boolean(thumbnailInternalPath),
    thumbnailInternalPath,
    rawMetadataJson,
  }
}
