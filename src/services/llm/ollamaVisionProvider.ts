import type { VisionAnalysisInput } from './visionProvider'
import type { VisionImageInput } from '@/types/llm'
import { buildVisionUserText, HttpVisionProvider, VisionProviderError } from './httpVisionProvider'
import type { FetchLike } from './httpVisionProvider'

const DEFAULT_BASE_URL = 'http://localhost:11434'

type OllamaChatResponse = {
  message?: { content?: string }
}

/** Vision provider for a local Ollama server running a vision model (llava, ...). */
export class OllamaVisionProvider extends HttpVisionProvider {
  readonly name = 'ollama'

  constructor(
    model: string,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    fetchImpl?: FetchLike,
  ) {
    super(model, fetchImpl)
  }

  protected async requestOnce(input: VisionAnalysisInput) {
    return this.requestVisionJsonOnce(buildVisionUserText(input), input.images)
  }

  protected async requestVisionJsonOnce(prompt: string, images: VisionImageInput[]) {
    const rawResponseJson = await this.postJson(
      `${this.baseUrl.replace(/\/$/, '')}/api/chat`,
      {},
      {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
            images: images.map((image) => image.base64Png),
          },
        ],
        format: 'json',
        stream: false,
      },
    )

    const parsed = JSON.parse(rawResponseJson) as OllamaChatResponse
    const answerText = parsed.message?.content
    if (!answerText) {
      throw new VisionProviderError('Ollama response contained no message content.')
    }
    return { answerText, rawResponseJson }
  }

  protected async requestTextOnce(prompt: string, expectJson = false) {
    const rawResponseJson = await this.postJson(
      `${this.baseUrl.replace(/\/$/, '')}/api/chat`,
      {},
      {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        ...(expectJson ? { format: 'json' } : {}),
      },
    )

    const parsed = JSON.parse(rawResponseJson) as OllamaChatResponse
    const answerText = parsed.message?.content
    if (!answerText) {
      throw new VisionProviderError('Ollama response contained no message content.')
    }
    return { answerText, rawResponseJson }
  }
}
