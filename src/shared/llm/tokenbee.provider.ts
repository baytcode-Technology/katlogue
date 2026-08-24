import {
  CompressionRate,
  CompressionStrategy,
  TokenBee,
  TokenBeeModel,
  TokenBeeContext,
} from '@tokenbee/sdk'
import { AppError } from '../errors/app.error.js'
import type { LlmChatMessage, LlmProvider } from './types.js'

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>
}

export class TokenBeeProvider implements LlmProvider {
  private client: TokenBee

  constructor() {
    const apiKey = process.env.AISHOPY_TOKENBEE?.trim()
    if (!apiKey) {
      throw new AppError(500, 'AISHOPY_TOKENBEE is not configured', 'LLM_NOT_CONFIGURED')
    }

    const llmKey = process.env.LLM_API_KEY?.trim()
    if (!llmKey) {
      throw new AppError(500, 'LLM_API_KEY is not configured', 'LLM_NOT_CONFIGURED')
    }

    this.client = new TokenBee({
      apiKey,
      llmKey,
    })
  }

  async complete(systemPrompt: string, history: LlmChatMessage[]): Promise<string> {
    try {
      const res = (await this.client.send({
        model: TokenBeeModel.GroqGptOss20b,
        input: {
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          ],
          strategy: CompressionStrategy.Smart,
          context: TokenBeeContext.Auto,
          rate: CompressionRate.Medium,
        },
      })) as ChatCompletionResponse

      const text = res.choices?.[0]?.message?.content?.trim()
      if (!text) {
        throw new AppError(502, 'Empty response from TokenBee', 'LLM_EMPTY_RESPONSE')
      }
      return text
    } catch (err) {
      if (err instanceof AppError) throw err
      const message = err instanceof Error ? err.message : 'TokenBee request failed'
      throw new AppError(502, message, 'LLM_REQUEST_FAILED')
    }
  }
}
