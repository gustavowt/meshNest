import { normalizeModelScene } from '@/services/model-parsing/modelNormalizer'
import type { NormalizedModel } from '@/services/model-parsing/modelNormalizer'
import { loadStlScene } from '@/services/model-parsing/stlLoaderService'
import { loadThreeMfScene } from '@/services/model-parsing/threeMfLoaderService'
import { parseThreeMfPackage } from '@/services/model-parsing/threeMfPackageParser'
import { extractGeometryMetadata } from '@/services/model-parsing/geometryMetadata'
import { renderModelViews } from '@/services/rendering/modelRenderer'
import type { RenderedView } from '@/services/rendering/modelRenderer'
import { buildEmbeddingSourceText } from '@/services/llm/embeddingProvider'
import type { EmbeddingProvider } from '@/services/llm/embeddingProvider'
import type { VisionProvider } from '@/services/llm/visionProvider'
import type { IndexingResult } from '@/types/indexing'
import type { VisionImageInput, AIModelDescription } from '@/types/llm'
import type { ScannedFile } from '@/types/modelFile'
import type { GeometryMetadata, ThreeMfPackageMetadata } from '@/types/modelMetadata'
import type { IndexingBackend } from './indexingBackend'

export type IndexModelFileDeps = {
  backend: IndexingBackend
  visionProvider: VisionProvider
  embeddingProvider: EmbeddingProvider
  /** Render implementation; defaults to the WebGL renderer. Injectable for tests. */
  renderViews?: (model: NormalizedModel) => RenderedView[]
}

/**
 * Indexes one scanned model file end-to-end:
 * upsert -> skip check -> load -> metadata -> render -> vision -> embedding.
 *
 * Never throws for per-file problems: any failure marks the file as
 * failed with a persisted reason and returns a 'failed' result, so one
 * bad file can never abort a directory run.
 */
export async function indexModelFile(
  file: ScannedFile,
  projectId: string,
  deps: IndexModelFileDeps,
): Promise<IndexingResult> {
  const { backend, visionProvider, embeddingProvider } = deps
  const render = deps.renderViews ?? renderModelViews

  const record = await backend.upsertModelFile(file, projectId)
  if (record.status === 'indexed') {
    return { modelFileId: record.id, status: 'skipped' }
  }

  try {
    const bytes = await backend.readModelFile(file.absolutePath)

    let packageMetadata: ThreeMfPackageMetadata | undefined
    const scene =
      file.extension === 'stl'
        ? loadStlScene(bytes)
        : ((packageMetadata = parseThreeMfPackage(bytes)), loadThreeMfScene(bytes))

    const geometry = extractGeometryMetadata(scene)
    await backend.storeGeometryMetadata(record.id, geometry)
    if (packageMetadata) {
      await backend.storeThreeMfMetadata(record.id, packageMetadata)
    }

    const normalized = normalizeModelScene(scene)
    const views = render(normalized)
    await backend.saveRenderAssets(record.id, views)

    const images: VisionImageInput[] = views
      .filter((view) => view.viewName !== 'thumbnail')
      .map((view) => ({ viewName: view.viewName, base64Png: bytesToBase64(view.png) }))

    let descriptionObj: AIModelDescription
    let rawResponseJson = ''

    if (visionProvider.name === 'none') {
      descriptionObj = buildLocalDescription(file, geometry, packageMetadata)
      rawResponseJson = JSON.stringify(descriptionObj)
    } else {
      const visionResult = await visionProvider.describeModel({
        filename: file.filename,
        extension: file.extension,
        images,
        geometry,
        packageMetadata,
      })
      descriptionObj = visionResult.description
      rawResponseJson = visionResult.rawResponseJson
    }

    await backend.storeAiDescription(
      record.id,
      descriptionObj,
      rawResponseJson,
    )

    if (embeddingProvider.name !== 'none') {
      const sourceText = buildEmbeddingSourceText(descriptionObj)
      const embedding = await embeddingProvider.embedText(sourceText)
      await backend.storeEmbedding({
        modelFileId: record.id,
        provider: embeddingProvider.name,
        model: embeddingProvider.model,
        dimensions: embeddingProvider.dimensions,
        embedding,
        sourceText,
      })
    }

    await backend.markIndexed(record.id)
    return { modelFileId: record.id, status: 'indexed' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    await backend.markFailed(record.id, errorMessage)
    return { modelFileId: record.id, status: 'failed', errorMessage }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function buildLocalDescription(
  file: ScannedFile,
  geometry?: GeometryMetadata,
  packageMetadata?: ThreeMfPackageMetadata,
): AIModelDescription {
  const nameWithoutExt = file.filename.replace(/\.[^/.]+$/, '')
  const shortName = nameWithoutExt
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Unnamed Model'

  const descriptionParts: string[] = [
    `Local 3D model file named "${file.filename}" with a ${file.extension.toUpperCase()} extension.`
  ]

  if (geometry) {
    const { widthMm, heightMm, depthMm, triangleCount, vertexCount, isWatertight } = geometry
    if (widthMm !== undefined && heightMm !== undefined && depthMm !== undefined) {
      descriptionParts.push(
        `Geometry bounds: ${widthMm.toFixed(1)}mm width, ${heightMm.toFixed(1)}mm height, ${depthMm.toFixed(1)}mm depth.`
      )
    }
    if (triangleCount !== undefined) {
      descriptionParts.push(`Contains ${triangleCount.toLocaleString()} triangles.`)
    }
    if (vertexCount !== undefined) {
      descriptionParts.push(`Contains ${vertexCount.toLocaleString()} vertices.`)
    }
    if (isWatertight !== undefined) {
      descriptionParts.push(`The mesh structure is ${isWatertight ? 'watertight' : 'not watertight'}.`)
    }
  }

  if (packageMetadata) {
    const { objectNames, materialNames, colorValues } = packageMetadata
    if (objectNames && objectNames.length > 0) {
      descriptionParts.push(`Objects: ${objectNames.join(', ')}.`);
    }
    if (materialNames && materialNames.length > 0) {
      descriptionParts.push(`Materials: ${materialNames.join(', ')}.`);
    }
    if (colorValues && colorValues.length > 0) {
      descriptionParts.push(`Colors: ${colorValues.join(', ')}.`);
    }
  }

  const description = descriptionParts.join(' ')

  const tags = [file.extension.toUpperCase()]
  if (geometry?.isWatertight) {
    tags.push('watertight')
  }
  if (packageMetadata?.materialNames) {
    tags.push(...packageMetadata.materialNames)
  }
  if (packageMetadata?.colorValues) {
    tags.push(...packageMetadata.colorValues)
  }

  const objectsDetected = packageMetadata?.objectNames && packageMetadata.objectNames.length > 0
    ? packageMetadata.objectNames
    : [shortName]

  const searchPhrases = [shortName, file.filename]
  if (packageMetadata?.objectNames) {
    searchPhrases.push(...packageMetadata.objectNames)
  }

  return {
    shortName,
    description,
    likelyCategory: file.extension.toUpperCase() + ' File',
    tags: Array.from(new Set(tags.filter(Boolean))),
    objectsDetected: Array.from(new Set(objectsDetected.filter(Boolean))),
    confidence: 1.0,
    searchPhrases: Array.from(new Set(searchPhrases.filter(Boolean))),
    printUse: 'Local model catalog',
    style: 'Technical CAD / Mesh',
  }
}
