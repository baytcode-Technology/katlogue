export type LlmChatRole = 'user' | 'assistant' | 'system';

export type LlmChatMessage = {
  role: LlmChatRole;
  content: string;
};

export interface LlmProvider {
  complete(systemPrompt: string, history: LlmChatMessage[]): Promise<string>;
}
