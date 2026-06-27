import { AppError } from '../../../shared/errors/app.error.js';
import { assertStoreOwner, findStoreById } from '../../stores/repositories/store.repository.js';
import { buildSupportSystemPrompt } from '../knowledge/katlogue-support-knowledge.js';
import { completeWithFallback } from '../llm/index.js';
import type { LlmChatMessage } from '../llm/types.js';
import { checkSupportRateLimit } from '../rate-limit.js';
import * as supportRepository from '../repositories/support.repository.js';

export async function sendMessage(
  ownerId: string,
  storeId: number,
  conversationId: number,
  content: string
) {
  await assertStoreOwner(storeId, ownerId);

  try {
    checkSupportRateLimit(storeId);
  } catch {
    throw new AppError(429, 'Too many messages. Please try again in an hour.', 'RATE_LIMIT_EXCEEDED');
  }

  const conversation = await supportRepository.getConversationById(conversationId);
  if (!conversation || Number(conversation.store_id) !== Number(storeId)) {
    throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  }

  if (new Date(conversation.expires_at) <= new Date()) {
    throw new AppError(410, 'This conversation has expired', 'CONVERSATION_EXPIRED');
  }

  const userMessage = await supportRepository.insertMessage(conversationId, 'user', content);

  if (conversation.reply_mode === 'manual') {
    const updatedConversation = await supportRepository.getConversationById(conversationId);
    return {
      user_message: userMessage,
      assistant_message: null,
      conversation: updatedConversation,
    };
  }

  const history = await supportRepository.listMessages(conversationId);
  const llmHistory: LlmChatMessage[] = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

  const store = await findStoreById(storeId);
  const productCount = await supportRepository.countProductsForStore(storeId);
  const plan = store?.subscription_plan ?? 'starter';

  const systemPrompt = buildSupportSystemPrompt({
    storeName: store?.name,
    plan,
    productCount,
  });

  const assistantText = await completeWithFallback(systemPrompt, llmHistory);
  const assistantMessage = await supportRepository.insertMessage(
    conversationId,
    'assistant',
    assistantText
  );

  const updatedConversation = await supportRepository.getConversationById(conversationId);

  return {
    user_message: userMessage,
    assistant_message: assistantMessage,
    conversation: updatedConversation,
  };
}
