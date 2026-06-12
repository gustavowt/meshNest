export const SUPPORTED_MODEL_EXTENSIONS = ['stl', '3mf'] as const

export type SupportedModelExtension = (typeof SUPPORTED_MODEL_EXTENSIONS)[number]

export function isSupportedModelExtension(value: string): value is SupportedModelExtension {
  return (SUPPORTED_MODEL_EXTENSIONS as readonly string[]).includes(value.toLowerCase())
}

export type ModelFileStatus = 'pending' | 'indexed' | 'failed' | 'skipped'

/**
 * A model file persisted in the database.
 */
export type ModelFile = {
  id: string
  projectId: string
  absolutePath: string
  relativePath: string
  filename: string
  extension: SupportedModelExtension
  sizeBytes: number
  modifiedAt: string
  contentHash: string
  indexedAt?: string
  status: ModelFileStatus
  errorMessage?: string
}

/**
 * A file found by the directory scanner, before persistence.
 */
export type DiscoveredFile = {
  absolutePath: string
  relativePath: string
  filename: string
  extension: SupportedModelExtension
  sizeBytes: number
  modifiedAt: string
}

/**
 * A discovered file enriched with its content hash, ready for persistence.
 */
export type ScannedFile = DiscoveredFile & {
  contentHash: string
}
