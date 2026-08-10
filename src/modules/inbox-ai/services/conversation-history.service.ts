import * as instagramChatRepository from '../../instagram/repositories/instagram-chat.repository.js'
import * as whatsappChatRepository from '../../whatsapp/repositories/whatsapp-chat.repository.js'
import type { ConversationHistoryLine } from './parse-customer-intent.service.js'

const HISTORY_LIMIT = 6

export type InboxAiChannel = 'whatsapp' | 'instagram'

export async function fetchRecentConversationHistory(input: {
  channel: InboxAiChannel
  storeId: number
  conversationId: number
}): Promise<ConversationHistoryLine[]> {
  const messages =
    input.channel === 'whatsapp'
      ? await whatsappChatRepository.listMessages({
          storeId: input.storeId,
          conversationId: input.conversationId,
          limit: HISTORY_LIMIT,
        })
      : await instagramChatRepository.listMessages({
          storeId: input.storeId,
          conversationId: input.conversationId,
          limit: HISTORY_LIMIT,
        })

  return messages
    .slice()
    .reverse()
    .map((m) => {
      const text = ('caption' in m ? (m.caption ?? m.text_body) : m.text_body) ?? ''
      const trimmed = String(text).trim()
      if (!trimmed) return null
      const role: ConversationHistoryLine['role'] =
        m.direction === 'inbound' ? 'customer' : 'store'
      return { role, text: trimmed }
    })
    .filter((line): line is ConversationHistoryLine => line !== null)
}

export function formatConversationHistory(lines: ConversationHistoryLine[]): string | null {
  if (lines.length === 0) return null
  return lines.map((l) => `${l.role === 'customer' ? 'Customer' : 'Store'}: ${l.text}`).join('\n')
}
