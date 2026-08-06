import { AppError } from '../errors/app.error.js'
import type { LlmChatMessage, LlmProvider } from './types.js'

export const FALLBACK_MESSAGE =
  'Sorry, I could not reach our AI assistant right now. Please try again in a moment.'

export class GeminiProvider implements LlmProvider {
  private apiKey: string
  private model: string

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new AppError(500, 'GEMINI_API_KEY is not configured', 'LLM_NOT_CONFIGURED')
    }
    this.apiKey = apiKey
    this.model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'
  }

  async complete(systemPrompt: string, history: LlmChatMessage[]): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`

    const contents = history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1024,
          },
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        throw new AppError(502, `Gemini error: ${body.slice(0, 200)}`, 'LLM_REQUEST_FAILED')
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      if (!text) {
        throw new AppError(502, 'Empty response from Gemini', 'LLM_EMPTY_RESPONSE')
      }
      return text
    } catch (err) {
      if (err instanceof AppError) throw err
      const message = err instanceof Error ? err.message : 'Gemini request failed'
      throw new AppError(502, message, 'LLM_REQUEST_FAILED')
    }
  }
}
