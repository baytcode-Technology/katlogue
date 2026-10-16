import { AppError } from '../../../shared/errors/app.error.js';
import {
  detectLanguageAndScript,
  isEnglishSupportBodyValid,
} from '../../../shared/lib/detect-language-script.js';
import { FALLBACK_MESSAGE } from '../../../shared/llm/index.js';
import { notifyPlatformAdminsSupportMessage } from '../../notifications/services/notify-platform-admins.service.js';
import { assertStoreMember, findStoreById } from '../../stores/repositories/store.repository.js';
import { buildSupportSystemPrompt } from '../knowledge/katlogue-support-knowledge.js';
import {
  isManglishSupportBodyValid,
  resolveEnglishHowToBody,
  SUPPORT_ENGLISH_STEPS_ONLY,
  SUPPORT_MANGLISH_RETRY,
  wrapMalayalamScriptSupportReply,
} from '../lib/wrap-malayalam-support-reply.js';
import { completeWithFallback } from '../llm/index.js';
import type { LlmChatMessage } from '../llm/types.js';
import { checkSupportRateLimit } from '../rate-limit.js';
import * as supportRepository from '../repositories/support.repository.js';

function isLlmDown(text: string): boolean {
  return text.trim() === FALLBACK_MESSAGE || text.includes('could not reach our AI');
}

async function completeSupportAssistantReply(
  systemPrompt: string,
  history: LlmChatMessage[],
  scriptStyle: ReturnType<typeof detectLanguageAndScript>['scriptStyle'],
  language: string
): Promise<string> {
  const first = await completeWithFallback(systemPrompt, history);
  if (isLlmDown(first)) return first;

  if (scriptStyle === 'malayalam_script') {
    let retry: string | null = null;
    if (!isEnglishSupportBodyValid(first)) {
      retry = await completeWithFallback(systemPrompt, [
        ...history,
        { role: 'assistant', content: first },
        { role: 'user', content: SUPPORT_ENGLISH_STEPS_ONLY },
      ]);
      if (isLlmDown(retry)) retry = null;
    }
    return wrapMalayalamScriptSupportReply(resolveEnglishHowToBody(first, retry));
  }

  if (language === 'Malayalam' && scriptStyle === 'latin') {
    if (isManglishSupportBodyValid(first)) return first;
    const retry = await completeWithFallback(systemPrompt, [
      ...history,
      { role: 'assistant', content: first },
      { role: 'user', content: SUPPORT_MANGLISH_RETRY },
    ]);
    if (isLlmDown(retry)) return first;
    return isManglishSupportBodyValid(retry) ? retry : first;
  }

  return first;
}

export async function sendMessage(
  ownerId: string,
  storeId: number,
  conversationId: number,
  content: string
) {
  await assertStoreMember(storeId, ownerId);

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
    const store = await findStoreById(storeId).catch(() => null);
    void notifyPlatformAdminsSupportMessage({
      conversationId,
      messageId: Number(userMessage.id),
      ticketCode: conversation.ticket_code,
      preview: content,
      storeName: store?.name,
    }).catch((err) => {
      console.error('[notifications] platform admin support message push failed', err);
    });

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

  const merchantScript = detectLanguageAndScript(content);
  const systemPrompt = buildSupportSystemPrompt(
    {
      storeName: store?.name,
      plan,
      productCount,
    },
    {
      merchantLanguage: merchantScript.language,
      scriptStyle: merchantScript.scriptStyle,
    }
  );

  const assistantText = await completeSupportAssistantReply(
    systemPrompt,
    llmHistory,
    merchantScript.scriptStyle,
    merchantScript.language
  );
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
