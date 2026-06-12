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
import type { VisionImageInput } from '@/types/llm'
import type { ScannedFile } from '@/types/modelFile'
import type { ThreeMfPackageMetadata } from '@/types/modelMetadata'
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

    const visionResult = await visionProvider.describeModel({
      filename: file.filename,
      extension: file.extension,
      images,
      geometry,
      packageMetadata,
    })
    await backend.storeAiDescription(
      record.id,
      visionResult.description,
      visionResult.rawResponseJson,
    )

    const sourceText = buildEmbeddingSourceText(visionResult.description)
    const embedding = await embeddingProvider.embedText(sourceText)
    await backend.storeEmbedding({
      modelFileId: record.id,
      provider: embeddingProvider.name,
      model: embeddingProvider.model,
      dimensions: embeddingProvider.dimensions,
      embedding,
      sourceText,
    })

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
