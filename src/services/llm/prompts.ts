/**
 * Prompt sent to vision-capable LLMs together with the rendered views
 * of a model. The provider must return only valid JSON matching the
 * AIModelDescription shape (validated in jsonValidation.ts).
 */
export const VISION_PROMPT = `Analyze these rendered views of a 3D printable model.

Return only valid JSON with this shape:
{
  "shortName": string,
  "description": string,
  "likelyCategory": string,
  "tags": string[],
  "objectsDetected": string[],
  "printUse": string,
  "style": string,
  "confidence": number,
  "searchPhrases": string[]
}

Focus on what the object appears to be, not only geometry.
Mention uncertainty when the object is ambiguous.
Prefer practical 3D printing categories such as toys, tools, organizers, miniatures, printer parts, household, cosplay, replacement parts, decorative, and utility.`

export const SUGGESTED_CATEGORIES = [
  'toys',
  'tools',
  'organizers',
  'miniatures',
  'printer parts',
  'household',
  'cosplay',
  'replacement parts',
  'decorative',
  'utility',
] as const
