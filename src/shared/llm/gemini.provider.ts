import { GoogleGenAI } from '@google/genai'
import { AppError } from '../errors/app.error.js'
import type { LlmChatMessage, LlmCompleteOptions, LlmProvider } from './types.js'

export class GeminiProvider implements LlmProvider {
  private client: GoogleGenAI
  private model: string

  constructor() {
    const apiKey = process.env.LLM_API_KEY?.trim()
    if (!apiKey) {
      throw new AppError(500, 'LLM_API_KEY is not configured', 'LLM_NOT_CONFIGURED')
    }

    this.client = new GoogleGenAI({ apiKey })
    this.model = process.env.LLM_MODEL?.trim() || 'gemini-2.5-flash'
  }

  async complete(
    systemPrompt: string,
    history: LlmChatMessage[],
    options?: LlmCompleteOptions
  ): Promise<string> {
    const contents = history
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }))

    if (contents.length === 0) {
      throw new AppError(502, 'Empty prompt for AI provider', 'LLM_EMPTY_RESPONSE')
    }

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.4,
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingBudget: 0 },
          ...(options?.json ? { responseMimeType: 'application/json' } : {}),
        },
      })

      const text = response.text?.trim()
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
