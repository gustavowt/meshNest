import type { VisionAnalysisInput } from './visionProvider'
import { buildVisionUserText, HttpVisionProvider, VisionProviderError } from './httpVisionProvider'
import type { FetchLike } from './httpVisionProvider'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>
}

/**
 * Vision provider for OpenAI and any OpenAI-compatible chat-completions
 * endpoint (set baseUrl for proxies, Azure-style gateways, LM Studio, ...).
 */
export class OpenAiVisionProvider extends HttpVisionProvider {
  readonly name = 'openai'

  constructor(
    model: string,
    private readonly apiKey: string,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    fetchImpl?: FetchLike,
  ) {
    super(model, fetchImpl)
  }

  protected async requestOnce(input: VisionAnalysisInput) {
    const content: unknown[] = [{ type: 'text', text: buildVisionUserText(input) }]
    for (const image of input.images) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${image.base64Png}` },
      })
    }

    const rawResponseJson = await this.postJson(
      `${this.baseUrl.replace(/\/$/, '')}/chat/completions`,
      { Authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        messages: [{ role: 'user', content }],
        response_format: { type: 'json_object' },
      },
    )

    const parsed = JSON.parse(rawResponseJson) as ChatCompletionResponse
    const answerText = parsed.choices?.[0]?.message?.content
    if (!answerText) {
      throw new VisionProviderError('OpenAI response contained no message content.')
    }
    return { answerText, rawResponseJson }
  }

  protected async requestTextOnce(prompt: string, expectJson = false) {
    const rawResponseJson = await this.postJson(
      `${this.baseUrl.replace(/\/$/, '')}/chat/completions`,
      { Authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        ...(expectJson ? { response_format: { type: 'json_object' } } : {}),
      },
    )

    const parsed = JSON.parse(rawResponseJson) as ChatCompletionResponse
    const answerText = parsed.choices?.[0]?.message?.content
    if (!answerText) {
      throw new VisionProviderError('OpenAI response contained no message content.')
    }
    return { answerText, rawResponseJson }
  }
}
