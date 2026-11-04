export type LlmChatRole = 'user' | 'assistant' | 'system'

export type LlmChatMessage = {
  role: LlmChatRole
  content: string
}

export type LlmCompleteOptions = {
  json?: boolean
}

export type LlmToolParameter = {
  type: 'string' | 'integer'
  description?: string
}

export type LlmToolDefinition = {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, LlmToolParameter>
    required?: string[]
  }
}

export type LlmToolCall = {
  name: string
  args: Record<string, unknown>
}

export interface LlmProvider {
  complete(
    systemPrompt: string,
    history: LlmChatMessage[],
    options?: LlmCompleteOptions
  ): Promise<string>
  completeWithTools?(
    systemPrompt: string,
    history: LlmChatMessage[],
    tools: LlmToolDefinition[],
    runTool: (call: LlmToolCall) => Promise<unknown>
  ): Promise<string>
}
