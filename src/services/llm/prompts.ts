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

/**
 * Prompt used by the "Rename with AI" action. The model receives the raw
 * file name (plus optional known context) and must return a single clean,
 * human-readable title with nothing else around it.
 */
export const NAME_NORMALIZATION_PROMPT = `You normalize 3D model file names into clean, human-readable titles.

Rules:
- Return ONLY the normalized name, with no quotes, punctuation wrappers, or extra text.
- Use Title Case words separated by single spaces.
- Remove the file extension, version/junk tokens (v1, v2, final, copy, draft), ids, and separator noise (underscores, dashes, numbers in parentheses).
- Keep it concise (2-6 words) and descriptive of the object.`

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
