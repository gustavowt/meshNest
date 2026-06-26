import { z } from 'zod'
import type { AIModelDescription } from '@/types/llm'
import type { ImageSearchQuery } from '@/types/worldSearch'

export class VisionValidationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'VisionValidationError'
    this.cause = cause
  }
}

export const aiModelDescriptionSchema = z.object({
  shortName: z.string().min(1),
  description: z.string().min(1),
  likelyCategory: z.string().min(1),
  tags: z.array(z.string()),
  objectsDetected: z.array(z.string()),
  printUse: z.string().optional(),
  style: z.string().optional(),
  confidence: z.number().min(0).max(1),
  searchPhrases: z.array(z.string()),
})

/**
 * Validates a vision provider response (raw JSON string or already-parsed
 * value) against the AIModelDescription contract.
 *
 * @throws VisionValidationError when the response is not valid JSON or
 *         does not match the expected shape.
 */
export function validateVisionResponse(response: unknown): AIModelDescription {
  let value = response
  if (typeof response === 'string') {
    try {
      value = JSON.parse(response)
    } catch (error) {
      throw new VisionValidationError('Vision provider returned invalid JSON', error)
    }
  }

  const result = aiModelDescriptionSchema.safeParse(value)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new VisionValidationError(`Vision response failed validation: ${issues}`)
  }
  return result.data
}

export const imageSearchQuerySchema = z.object({
  query: z.string().min(1),
  tags: z.array(z.string()),
  category: z.string().optional(),
})

export function validateImageSearchQuery(response: unknown): ImageSearchQuery {
  let value = response
  if (typeof response === 'string') {
    try {
      value = JSON.parse(response)
    } catch (error) {
      throw new VisionValidationError('Vision provider returned invalid JSON', error)
    }
  }

  const result = imageSearchQuerySchema.safeParse(value)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new VisionValidationError(`Image search response failed validation: ${issues}`)
  }
  return result.data
}
