import { AppError } from '../../../shared/errors/app.error.js';
import { FALLBACK_MESSAGE, GeminiProvider } from './gemini.provider.js';
import { GroqProvider } from './groq.provider.js';
import type { LlmProvider } from './types.js';

let cachedProvider: LlmProvider | null = null;

export function getLlmProvider(): LlmProvider {
  if (cachedProvider) return cachedProvider;

  const provider = (process.env.LLM_PROVIDER ?? 'groq').toLowerCase();
  if (provider === 'gemini') {
    cachedProvider = new GeminiProvider();
  } else if (provider === 'groq') {
    cachedProvider = new GroqProvider();
  } else {
    throw new AppError(500, `Unknown LLM_PROVIDER: ${provider}`, 'LLM_NOT_CONFIGURED');
  }

  return cachedProvider;
}

export async function completeWithFallback(
  systemPrompt: string,
  history: Parameters<LlmProvider['complete']>[1]
): Promise<string> {
  try {
    return await getLlmProvider().complete(systemPrompt, history);
  } catch (err) {
    console.error('[support-llm]', err instanceof Error ? err.message : err);
    return FALLBACK_MESSAGE;
  }
}
