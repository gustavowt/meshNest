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
- Use known context when it clarifies the actual object, print use, category, style, or variant.
- Prefer short names: 2-5 words, object-first, practical, and easy to scan in a file list.
- Keep distinguishing details only when they matter, such as size, side, adapter type, character, or part variant.`

/**
 * Prompt used by the library "Mass Rename with AI" action. The model receives
 * several files and must return one concise normalized title per id.
 */
export const BULK_NAME_NORMALIZATION_PROMPT = `You normalize batches of 3D model file names into clean, human-readable titles.

Rules:
- Return ONLY valid JSON with this shape: {"renames":[{"id":"file id","normalizedName":"Short Title"}]}.
- Include exactly one result for every input id.
- Use Title Case words separated by single spaces.
- Remove file extensions, version/junk tokens (v1, v2, final, copy, draft), ids, and separator noise.
- Use each file's context to identify the actual object, print use, category, style, or variant.
- Prefer short names: 2-5 words, object-first, practical, and easy to scan in a file list.
- Avoid duplicate names within the batch. Preserve short distinguishing details when needed.`

/**
 * Human-readable names for the languages the user can pick in Settings,
 * used to instruct vision models to answer in that language.
 */
export const LANGUAGE_NAMES: Record<'en' | 'pt' | 'es', string> = {
  en: 'English',
  pt: 'Portuguese',
  es: 'Spanish',
}

/**
 * Builds the instruction that asks the model to write the human-readable
 * description fields in the user's language while keeping the JSON keys
 * and structure exactly as specified. Returns an empty string for English
 * (the prompt's native language) so existing behavior is unchanged.
 */
export function buildLanguageInstruction(language?: 'en' | 'pt' | 'es'): string {
  if (!language || language === 'en') {
    return ''
  }
  const languageName = LANGUAGE_NAMES[language]
  return `Write all human-readable text values (shortName, description, likelyCategory, tags, objectsDetected, printUse, style, searchPhrases) in ${languageName}. Keep the JSON keys and overall structure exactly as specified, in English.`
}

/** Prompt for converting a reference photo into world-search keywords. */
export const IMAGE_WORLD_SEARCH_PROMPT = `Look at this image and infer what 3D printable model the user is trying to find online.

Return only valid JSON with this shape:
{
  "query": string,
  "tags": string[],
  "category": string
}

Rules:
- "query" should be a concise search phrase (2-6 words) suitable for STL/3MF repositories.
- Prefer words a maker would use to find a printable STL/3MF file, not a generic render/game asset.
- Add "STL", "3MF", "printable", or "3D print" when those words would improve repository search.
- "tags" should list 3-8 practical printing keywords (object type, style, function, character, support-free, articulated, etc.).
- "category" should be one practical 3D printing category when possible.
- Focus on the object itself, not the photo background.`

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
