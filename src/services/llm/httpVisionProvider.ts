import type { VisionAnalysisInput, VisionProvider, VisionProviderResult } from './visionProvider'
import { validateVisionResponse, VisionValidationError } from './jsonValidation'
import { NAME_NORMALIZATION_PROMPT, VISION_PROMPT } from './prompts'

export type FetchLike = typeof fetch

/** User-facing failure from a remote vision provider (auth, network, HTTP). */
export class VisionProviderError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'VisionProviderError'
    this.cause = cause
  }
}

/**
 * Builds the textual part of the vision request: the structured-JSON
 * prompt plus whatever context we know about the file (name, geometry,
 * 3MF package metadata). Image parts are attached per provider.
 */
export function buildVisionUserText(input: VisionAnalysisInput): string {
  const lines = [VISION_PROMPT, '', `Filename: ${input.filename} (.${input.extension})`]

  const g = input.geometry
  if (g) {
    if (g.widthMm !== undefined && g.heightMm !== undefined && g.depthMm !== undefined) {
      lines.push(
        `Bounding box: ${g.widthMm.toFixed(1)} x ${g.heightMm.toFixed(1)} x ${g.depthMm.toFixed(1)} mm`,
      )
    }
    if (g.triangleCount !== undefined) {
      lines.push(`Triangles: ${g.triangleCount}`)
    }
    if (g.objectCount !== undefined && g.objectCount > 1) {
      lines.push(`Objects in file: ${g.objectCount}`)
    }
  }

  const pkg = input.packageMetadata
  if (pkg) {
    if (pkg.objectNames.length > 0) {
      lines.push(`3MF object names: ${pkg.objectNames.slice(0, 10).join(', ')}`)
    }
    if (pkg.materialNames.length > 0) {
      lines.push(`3MF material names: ${pkg.materialNames.slice(0, 10).join(', ')}`)
    }
  }

  return lines.join('\n')
}

/**
 * One round-trip against a concrete provider API: returns the model's
 * text answer (expected to be the JSON description) and the exact raw
 * response body for storage.
 */
export type VisionRequestOnce = (
  input: VisionAnalysisInput,
) => Promise<{ answerText: string; rawResponseJson: string }>

/**
 * Base class for HTTP vision providers. Subclasses implement a single
 * API round-trip; this class adds JSON validation and one retry when
 * the model returns malformed or non-conforming JSON (per roadmap).
 */
export abstract class HttpVisionProvider implements VisionProvider {
  abstract readonly name: string

  constructor(
    readonly model: string,
    protected readonly fetchImpl: FetchLike = fetch,
  ) {}

  protected abstract requestOnce(
    input: VisionAnalysisInput,
  ): ReturnType<VisionRequestOnce>

  /** One text-only round-trip (no images), used for name normalization. */
  protected abstract requestTextOnce(
    prompt: string,
  ): Promise<{ answerText: string; rawResponseJson: string }>

  async normalizeName(rawName: string, context?: string): Promise<string> {
    const { answerText } = await this.requestTextOnce(
      buildNameNormalizationPrompt(rawName, context),
    )
    const cleaned = cleanNormalizedName(answerText)
    if (!cleaned) {
      throw new VisionProviderError(`${this.name} returned an empty name.`)
    }
    return cleaned
  }

  async describeModel(input: VisionAnalysisInput): Promise<VisionProviderResult> {
    let lastValidationError: VisionValidationError | undefined
    for (let attempt = 0; attempt < 2; attempt++) {
      const { answerText, rawResponseJson } = await this.requestOnce(input)
      try {
        const description = validateVisionResponse(stripJsonFences(answerText))
        return { description, rawResponseJson }
      } catch (error) {
        if (error instanceof VisionValidationError) {
          lastValidationError = error
          continue
        }
        throw error
      }
    }
    throw new VisionProviderError(
      `${this.name} returned an invalid description twice: ${lastValidationError?.message}`,
      lastValidationError,
    )
  }

  protected async postJson(url: string, headers: Record<string, string>, body: unknown): Promise<string> {
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new VisionProviderError(`Could not reach ${this.name}: ${reason}`, error)
    }
    const text = await response.text()
    if (!response.ok) {
      const detail = text.slice(0, 300)
      if (response.status === 401 || response.status === 403) {
        throw new VisionProviderError(`${this.name} rejected the API key (HTTP ${response.status}).`)
      }
      throw new VisionProviderError(`${this.name} request failed with HTTP ${response.status}: ${detail}`)
    }
    return text
  }
}

/** Models sometimes wrap JSON in markdown code fences despite instructions. */
export function stripJsonFences(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return match ? match[1] : trimmed
}

/** Builds the text-only prompt for the "Rename with AI" action. */
export function buildNameNormalizationPrompt(rawName: string, context?: string): string {
  const lines = [NAME_NORMALIZATION_PROMPT, '', `Raw file name: ${rawName}`]
  if (context?.trim()) {
    lines.push(`Known context about the model: ${context.trim()}`)
  }
  lines.push('', 'Normalized name:')
  return lines.join('\n')
}

/** Extracts a single clean title from a model's free-text answer. */
export function cleanNormalizedName(text: string): string {
  const firstLine =
    stripJsonFences(text)
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ''
  return firstLine
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
