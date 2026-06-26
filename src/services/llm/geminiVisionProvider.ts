import type { VisionAnalysisInput } from './visionProvider'
import type { VisionImageInput } from '@/types/llm'
import { buildVisionUserText, HttpVisionProvider, VisionProviderError } from './httpVisionProvider'
import type { FetchLike } from './httpVisionProvider'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

type GenerateContentResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

/** Vision provider for the Google Gemini generateContent API. */
export class GeminiVisionProvider extends HttpVisionProvider {
  readonly name = 'gemini'

  constructor(
    model: string,
    private readonly apiKey: string,
    fetchImpl?: FetchLike,
  ) {
    super(model, fetchImpl)
  }

  protected async requestOnce(input: VisionAnalysisInput) {
    return this.requestVisionJsonOnce(buildVisionUserText(input), input.images)
  }

  protected async requestVisionJsonOnce(prompt: string, images: VisionImageInput[]) {
    const parts: unknown[] = [{ text: prompt }]
    for (const image of images) {
      parts.push({ inline_data: { mime_type: 'image/png', data: image.base64Png } })
    }

    const rawResponseJson = await this.postJson(
      `${GEMINI_BASE}/models/${this.model}:generateContent`,
      { 'x-goog-api-key': this.apiKey },
      {
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json' },
      },
    )

    const parsed = JSON.parse(rawResponseJson) as GenerateContentResponse
    const answerText = parsed.candidates?.[0]?.content?.parts?.[0]?.text
    if (!answerText) {
      throw new VisionProviderError('Gemini response contained no candidate text.')
    }
    return { answerText, rawResponseJson }
  }

  protected async requestTextOnce(prompt: string, expectJson = false) {
    const rawResponseJson = await this.postJson(
      `${GEMINI_BASE}/models/${this.model}:generateContent`,
      { 'x-goog-api-key': this.apiKey },
      {
        contents: [{ parts: [{ text: prompt }] }],
        ...(expectJson ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
      },
    )

    const parsed = JSON.parse(rawResponseJson) as GenerateContentResponse
    const answerText = parsed.candidates?.[0]?.content?.parts?.[0]?.text
    if (!answerText) {
      throw new VisionProviderError('Gemini response contained no candidate text.')
    }
    return { answerText, rawResponseJson }
  }
}
