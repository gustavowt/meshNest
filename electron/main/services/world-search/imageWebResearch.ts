import type { ImageResearchConfig, ImageWebResearchResult } from '../../../../src/types/worldSearch'
import type { FetchLike } from '../../../../src/services/llm/httpVisionProvider'

type GoogleWebDetectionResponse = {
  responses?: Array<{
    error?: { message?: string }
    webDetection?: {
      bestGuessLabels?: Array<{ label?: string }>
      webEntities?: Array<{ description?: string; score?: number }>
      pagesWithMatchingImages?: Array<{ pageTitle?: string }>
    }
  }>
}

export class ImageWebResearchError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'ImageWebResearchError'
    this.cause = cause
  }
}

export async function researchImageOnWeb(
  imageBase64Png: string,
  config: ImageResearchConfig,
  fetchImpl: FetchLike = fetch,
): Promise<ImageWebResearchResult | undefined> {
  if (!config.enabled) {
    return undefined
  }

  const apiKey = config.credentials.apiKey?.trim()
  if (!apiKey) {
    throw new ImageWebResearchError('Google Cloud Vision image research requires an API key.')
  }

  return researchImageWithGoogleWebDetection(imageBase64Png, apiKey, fetchImpl)
}

export async function researchImageWithGoogleWebDetection(
  imageBase64Png: string,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<ImageWebResearchResult> {
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`
  const body = {
    requests: [
      {
        image: { content: imageBase64Png },
        features: [{ type: 'WEB_DETECTION', maxResults: 10 }],
      },
    ],
  }

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ImageWebResearchError(`Could not reach Google Cloud Vision: ${reason}`, error)
  }

  const text = await response.text()
  if (!response.ok) {
    const detail = text.slice(0, 300)
    throw new ImageWebResearchError(`Google Cloud Vision request failed with HTTP ${response.status}: ${detail}`)
  }

  let parsed: GoogleWebDetectionResponse
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new ImageWebResearchError('Google Cloud Vision returned invalid JSON.', error)
  }

  const first = parsed.responses?.[0]
  if (first?.error?.message) {
    throw new ImageWebResearchError(`Google Cloud Vision returned an error: ${first.error.message}`)
  }

  const webDetection = first?.webDetection
  return {
    bestGuessLabels: uniqueStrings(
      webDetection?.bestGuessLabels?.map((label) => label.label).filter(isNonEmptyString) ?? [],
    ),
    webEntities: uniqueStrings(
      webDetection?.webEntities
        ?.filter((entity) => (entity.score ?? 0) >= 0.4)
        .map((entity) => entity.description)
        .filter(isNonEmptyString) ?? [],
    ),
    pageTitles: uniqueStrings(
      webDetection?.pagesWithMatchingImages
        ?.map((page) => page.pageTitle)
        .filter(isNonEmptyString) ?? [],
    ),
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}
