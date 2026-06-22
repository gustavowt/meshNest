import type { AIModelDescription, VisionImageInput } from '@/types/llm'
import type { SupportedModelExtension } from '@/types/modelFile'
import type { GeometryMetadata, ThreeMfPackageMetadata } from '@/types/modelMetadata'

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
}

export type VisionProviderResult = {
  description: AIModelDescription
  /** Exact raw response payload, stored for debugging. */
  rawResponseJson: string
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
}
