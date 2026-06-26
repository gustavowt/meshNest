import type { AIModelDescription, VisionImageInput } from '@/types/llm'
import type { SupportedModelExtension } from '@/types/modelFile'
import type { GeometryMetadata, ThreeMfPackageMetadata } from '@/types/modelMetadata'
import type { AppLanguage } from '@/types/providerSettings'
import type { ImageSearchQuery, ImageWebResearchResult } from '@/types/worldSearch'

/**
 * Everything a vision provider receives to describe one model.
 */
export type VisionAnalysisInput = {
  filename: string
  extension: SupportedModelExtension
  /** Rendered views (front/back/left/right/top/perspective and thumbnail). */
  images: VisionImageInput[]
  geometry?: GeometryMetadata
  /** 3MF package metadata, when the file is a 3MF. */
  packageMetadata?: ThreeMfPackageMetadata
  /**
   * UI language the user picked in Settings. When set to a non-English
   * language the model is asked to write the human-readable description
   * fields in that language (JSON keys stay unchanged).
   */
  language?: AppLanguage
}

export type VisionProviderResult = {
  description: AIModelDescription
  /** Exact raw response payload, stored for debugging. */
  rawResponseJson: string
}

export type NameNormalizationInput = {
  id: string
  rawName: string
  context?: string
}

export type NameNormalizationResult = {
  id: string
  normalizedName: string
}

/**
 * Contract implemented by every vision backend (mock, OpenAI-compatible,
 * Ollama, ...). The indexing pipeline depends only on this interface and
 * never knows which implementation is active.
 */
export interface VisionProvider {
  readonly name: string
  readonly model: string
  describeModel(input: VisionAnalysisInput): Promise<VisionProviderResult>
  /**
   * Normalizes a raw model file name into a clean, human-readable title
   * (text-only LLM call). `context` may carry known facts about the model
   * (e.g. AI description, category) to improve the suggestion.
   */
  normalizeName(rawName: string, context?: string): Promise<string>
  /**
   * Normalizes several names in one text-only LLM call. Each result is keyed by
   * the corresponding input id so callers can keep file records aligned.
   */
  normalizeNames(items: NameNormalizationInput[]): Promise<NameNormalizationResult[]>
  /**
   * Converts one or more reference images into search keywords for world search.
   */
  analyzeImageForSearch(
    images: VisionImageInput[],
    language?: AppLanguage,
    webResearch?: ImageWebResearchResult,
  ): Promise<ImageSearchQuery>
}
