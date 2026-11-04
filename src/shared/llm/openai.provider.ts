import OpenAI from 'openai'
import { AppError } from '../errors/app.error.js'
import type { LlmChatMessage, LlmCompleteOptions, LlmProvider } from './types.js'

export class OpenAiProvider implements LlmProvider {
  private client: OpenAI
  private model: string

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey?.trim() || process.env.LLM_API_KEY?.trim()
    if (!apiKey) {
      throw new AppError(500, 'LLM_API_KEY is not configured', 'LLM_NOT_CONFIGURED')
    }

    this.client = new OpenAI({ apiKey })
    this.model = options?.model?.trim() || process.env.LLM_MODEL?.trim() || 'gpt-4o-mini'
  }

  async complete(
    systemPrompt: string,
    history: LlmChatMessage[],
    options?: LlmCompleteOptions
  ): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map((m) => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
          })),
        ],
        temperature: 0.4,
        max_tokens: 1024,
        ...(options?.json ? { response_format: { type: 'json_object' as const } } : {}),
      })

      const text = response.choices[0]?.message?.content?.trim()
      if (!text) {
        throw new AppError(502, 'Empty response from AI provider', 'LLM_EMPTY_RESPONSE')
      }
      return text
    } catch (err) {
      if (err instanceof AppError) throw err
      const message = err instanceof Error ? err.message : 'AI request failed'
      throw new AppError(502, message, 'LLM_REQUEST_FAILED')
    }
  }
}
