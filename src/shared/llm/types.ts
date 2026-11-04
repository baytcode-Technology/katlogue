export type LlmChatRole = 'user' | 'assistant' | 'system'

export type LlmChatMessage = {
  role: LlmChatRole
  content: string
}

export type LlmCompleteOptions = {
  json?: boolean
}

export interface LlmProvider {
  complete(
    systemPrompt: string,
    history: LlmChatMessage[],
    options?: LlmCompleteOptions
  ): Promise<string>
}
