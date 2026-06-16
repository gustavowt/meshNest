import type { ModelFileStatus, SupportedModelExtension } from './modelFile'

/**
 * One model file as shown in the library: file record joined with the
 * AI description summary and the thumbnail render, when available.
 */
export type LibraryEntry = {
  id: string
  filename: string
  relativePath: string
  absolutePath: string
  extension: SupportedModelExtension
  sizeBytes: number
  modifiedAt: string
  indexedAt?: string
  status: ModelFileStatus
  errorMessage?: string
  /** AI-generated short name, present once the file is indexed. */
  shortName?: string
  likelyCategory?: string
  tags: string[]
  /** Absolute path of the thumbnail PNG on disk. */
  thumbnailPath?: string
  /** Vector search similarity score (0..1) when retrieved via semantic search. */
  score?: number
}

export type LibrarySortKey = 'filename' | 'modifiedAt' | 'indexedAt'
