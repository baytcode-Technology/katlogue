import { AppError } from '../errors/app.error.js'
import { GeminiProvider } from './gemini.provider.js'
import { OpenAiProvider } from './openai.provider.js'
import { TokenBeeProvider } from './tokenbee.provider.js'
import type { LlmChatMessage, LlmCompleteOptions, LlmProvider } from './types.js'

export const FALLBACK_MESSAGE =
  'Sorry, I could not reach our AI assistant right now. Please try again in a moment.'

let cachedProvider: LlmProvider | null = null
let cachedFallback: LlmProvider | null | undefined

export function getLlmProvider(): LlmProvider {
  if (cachedProvider) return cachedProvider
  const provider = (process.env.LLM_PROVIDER ?? 'openai').toLowerCase()
  if (provider === 'tokenbee') {
    cachedProvider = new TokenBeeProvider()
  } else if (provider === 'openai') {
    cachedProvider = new OpenAiProvider()
  } else if (provider === 'gemini') {
    cachedProvider = new GeminiProvider()
  } else {
    throw new AppError(500, `Unknown LLM_PROVIDER: ${provider}`, 'LLM_NOT_CONFIGURED')
  }

  return cachedProvider
}

function getFallbackProvider(): LlmProvider | null {
  if (cachedFallback !== undefined) return cachedFallback
  if ((process.env.LLM_FALLBACK_PROVIDER ?? '').toLowerCase() !== 'openai') {
    cachedFallback = null
    return null
  }
  const apiKey = process.env.LLM_FALLBACK_API_KEY?.trim()
  if (!apiKey) {
    cachedFallback = null
    return null
  }
  cachedFallback = new OpenAiProvider({
    apiKey,
    model: process.env.LLM_FALLBACK_MODEL?.trim() || 'gpt-4.1-mini',
  })
  return cachedFallback
}

async function completeWithOptionalFallback(
  systemPrompt: string,
  history: LlmChatMessage[],
  options?: LlmCompleteOptions
): Promise<string> {
  try {
    return await getLlmProvider().complete(systemPrompt, history, options)
  } catch (primaryErr) {
    const fallback = getFallbackProvider()
    if (!fallback) throw primaryErr
    console.error(
      '[llm] primary provider failed, trying fallback:',
      primaryErr instanceof Error ? primaryErr.message : primaryErr
    )
    return fallback.complete(systemPrompt, history, options)
  }
}

export async function completeWithFallback(
  systemPrompt: string,
  history: LlmChatMessage[]
): Promise<string> {
  try {
    return await completeWithOptionalFallback(systemPrompt, history)
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
    const raw = await completeWithOptionalFallback(
      prompt,
      [...history, { role: 'user', content: userMessage }],
      { json: true }
    )
    const cleaned = stripJsonFences(raw)
    return JSON.parse(cleaned) as T
  } catch (err) {
    console.error('[llm-json]', err instanceof Error ? err.message : err)
    return null
  }
}

export type { LlmChatMessage, LlmProvider } from './types.js'
