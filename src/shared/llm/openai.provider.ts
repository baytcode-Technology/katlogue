import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { AppError } from '../errors/app.error.js'
import type {
  LlmChatMessage,
  LlmCompleteOptions,
  LlmProvider,
  LlmToolCall,
  LlmToolDefinition,
} from './types.js'

const MAX_TOOL_ROUNDS = 3

export class OpenAiProvider implements LlmProvider {
  private client: OpenAI
  private model: string

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey?.trim() || process.env.LLM_API_KEY?.trim()
    if (!apiKey) {
      throw new AppError(500, 'LLM_API_KEY is not configured', 'LLM_NOT_CONFIGURED')
    }

    this.client = new OpenAI({ apiKey })
    this.model = options?.model?.trim() || process.env.LLM_MODEL?.trim() || 'gpt-4.1-mini'
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

  async completeWithTools(
    systemPrompt: string,
    history: LlmChatMessage[],
    tools: LlmToolDefinition[],
    runTool: (call: LlmToolCall) => Promise<unknown>
  ): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role as 'user' | 'assistant',
          content: message.content,
        })),
    ]

    if (messages.length < 2) {
      throw new AppError(502, 'Empty prompt for AI provider', 'LLM_EMPTY_RESPONSE')
    }

    const openAiTools = tools.map(toOpenAiTool)

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages,
          tools: openAiTools,
          tool_choice: 'auto',
          temperature: 0.4,
          max_tokens: 1024,
        })

        const choice = response.choices[0]?.message
        if (!choice) {
          throw new AppError(502, 'Empty response from AI provider', 'LLM_EMPTY_RESPONSE')
        }

        const calls = choice.tool_calls ?? []
        if (calls.length === 0) {
          const text = choice.content?.trim()
          if (!text) {
            throw new AppError(502, 'Empty response from AI provider', 'LLM_EMPTY_RESPONSE')
          }
          return text
        }

        messages.push(choice)

        for (const call of calls) {
          if (call.type !== 'function') continue
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
          } catch {
            args = {}
          }
          const output = await runTool({ name: call.function.name, args })
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(output ?? null),
          })
        }
      }

      throw new AppError(502, 'AI tool loop did not finish', 'LLM_REQUEST_FAILED')
    } catch (err) {
      if (err instanceof AppError) throw err
      const message = err instanceof Error ? err.message : 'AI request failed'
      throw new AppError(502, message, 'LLM_REQUEST_FAILED')
    }
  }
}

function toOpenAiTool(tool: LlmToolDefinition): OpenAI.Chat.Completions.ChatCompletionTool {
  const properties: Record<string, { type: 'string' | 'integer'; description?: string }> = {}
  for (const [key, spec] of Object.entries(tool.parameters.properties)) {
    properties[key] = { type: spec.type, description: spec.description }
  }
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties,
        required: tool.parameters.required,
      },
    },
  }
}
