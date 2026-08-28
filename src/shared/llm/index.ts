import { AppError } from '../errors/app.error.js'
import { OpenAiProvider } from './openai.provider.js'
import { TokenBeeProvider } from './tokenbee.provider.js'
import type { LlmChatMessage, LlmProvider } from './types.js'

export const FALLBACK_MESSAGE =
  'Sorry, I could not reach our AI assistant right now. Please try again in a moment.'

let cachedProvider: LlmProvider | null = null

export function getLlmProvider(): LlmProvider {
  if (cachedProvider) return cachedProvider

  const provider = (process.env.LLM_PROVIDER ?? 'tokenbee').toLowerCase()
  if (provider === 'tokenbee') {
    cachedProvider = new TokenBeeProvider()
  } else if (provider === 'openai') {
    cachedProvider = new OpenAiProvider()
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
