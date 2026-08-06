import { AppError } from '../errors/app.error.js'
import { FALLBACK_MESSAGE, GeminiProvider } from './gemini.provider.js'
import { GroqProvider } from './groq.provider.js'
import type { LlmChatMessage, LlmProvider } from './types.js'

let cachedProvider: LlmProvider | null = null

export function getLlmProvider(): LlmProvider {
  if (cachedProvider) return cachedProvider

  const provider = (process.env.LLM_PROVIDER ?? 'groq').toLowerCase()
  if (provider === 'gemini') {
    cachedProvider = new GeminiProvider()
  } else if (provider === 'groq') {
    cachedProvider = new GroqProvider()
  } else {
    throw new AppError(500, `Unknown LLM_PROVIDER: ${provider}`, 'LLM_NOT_CONFIGURED')
  }

  return cachedProvider
}

export async function completeWithFallback(
  systemPrompt: string,
  history: LlmChatMessage[]
): Promise<string> {
  try {
    return await getLlmProvider().complete(systemPrompt, history)
  } catch (err) {
    console.error('[llm]', err instanceof Error ? err.message : err)
    return FALLBACK_MESSAGE
  }
}

function stripJsonFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

export async function completeJson<T>(
  systemPrompt: string,
  userMessage: string,
  history: LlmChatMessage[] = []
): Promise<T | null> {
  const prompt = `${systemPrompt}\n\nRespond with valid JSON only. No markdown fences or extra text.`
  try {
    const raw = await getLlmProvider().complete(prompt, [
      ...history,
      { role: 'user', content: userMessage },
    ])
    const cleaned = stripJsonFences(raw)
    return JSON.parse(cleaned) as T
  } catch (err) {
    console.error('[llm-json]', err instanceof Error ? err.message : err)
    return null
  }
}

export type { LlmChatMessage, LlmProvider } from './types.js'
export { FALLBACK_MESSAGE }
