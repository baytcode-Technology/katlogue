import { GoogleGenAI, Type, type Content, type FunctionDeclaration, type Part } from '@google/genai'
import { AppError } from '../errors/app.error.js'
import type {
  LlmChatMessage,
  LlmCompleteOptions,
  LlmProvider,
  LlmToolCall,
  LlmToolDefinition,
} from './types.js'

const MAX_TOOL_ROUNDS = 3

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

  async completeWithTools(
    systemPrompt: string,
    history: LlmChatMessage[],
    tools: LlmToolDefinition[],
    runTool: (call: LlmToolCall) => Promise<unknown>
  ): Promise<string> {
    const contents: Content[] = history
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }))

    if (contents.length === 0) {
      throw new AppError(502, 'Empty prompt for AI provider', 'LLM_EMPTY_RESPONSE')
    }

    const declarations = tools.map(toFunctionDeclaration)

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const response = await this.client.models.generateContent({
          model: this.model,
          contents,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.4,
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingBudget: 0 },
            tools: [{ functionDeclarations: declarations }],
          },
        })

        const calls = response.functionCalls ?? []
        if (calls.length === 0) {
          const text = response.text?.trim()
          if (!text) {
            throw new AppError(502, 'Empty response from AI provider', 'LLM_EMPTY_RESPONSE')
          }
          return text
        }

        const modelContent = response.candidates?.[0]?.content
        if (modelContent) contents.push(modelContent)

        const responseParts: Part[] = []
        for (const call of calls) {
          const name = call.name?.trim()
          if (!name) continue
          const args = call.args ?? {}
          const output = await runTool({ name, args })
          responseParts.push({
            functionResponse: {
              name,
              id: call.id,
              response: { output: output ?? null },
            },
          })
        }
        contents.push({ role: 'user', parts: responseParts })
      }

      throw new AppError(502, 'AI tool loop did not finish', 'LLM_REQUEST_FAILED')
    } catch (err) {
      if (err instanceof AppError) throw err
      const message = err instanceof Error ? err.message : 'AI request failed'
      throw new AppError(502, message, 'LLM_REQUEST_FAILED')
    }
  }
}

function toFunctionDeclaration(tool: LlmToolDefinition): FunctionDeclaration {
  const properties: NonNullable<FunctionDeclaration['parameters']>['properties'] = {}
  for (const [key, spec] of Object.entries(tool.parameters.properties)) {
    properties[key] = {
      type: spec.type === 'integer' ? Type.INTEGER : Type.STRING,
      description: spec.description,
    }
  }
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: Type.OBJECT,
      properties,
      required: tool.parameters.required,
    },
  }
}
