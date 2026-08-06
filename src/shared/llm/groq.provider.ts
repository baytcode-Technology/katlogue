import OpenAI from 'openai'
import { AppError } from '../errors/app.error.js'
import type { LlmChatMessage, LlmProvider } from './types.js'

export class GroqProvider implements LlmProvider {
  private client: OpenAI
  private model: string

  constructor() {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      throw new AppError(500, 'GROQ_API_KEY is not configured', 'LLM_NOT_CONFIGURED')
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    })
    this.model = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
  }

  async complete(systemPrompt: string, history: LlmChatMessage[]): Promise<string> {
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
