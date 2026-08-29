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
      const caption = 'caption' in m ? m.caption : null
      const textBody = 'text_body' in m ? m.text_body : null
      const text = (caption ?? textBody) ?? ''
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

export type LastShownProductRef = {
  title: string
  url: string | null
}

const PRODUCT_URL_PATTERN = /https?:\/\/\S*\/product\/([a-z0-9-]+)[^\s]*/gi

/**
 * Product name is derived from the storefront URL slug rather than the message
 * text, so it stays correct no matter how the caption was worded and can never
 * pick up a stale price.
 */
function titleFromProductSlug(slug: string): string {
  return slug
    .replace(/-\d+$/, '')
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim()
}

/**
 * Last product we sent in this chat, so a bare "ok" can be answered about that
 * product instead of triggering a fresh catalog search.
 */
export function extractLastShownProduct(
  lines: ConversationHistoryLine[]
): LastShownProductRef | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]
    if (line.role !== 'store') continue

    const matches = [...line.text.matchAll(PRODUCT_URL_PATTERN)]
    if (matches.length !== 1) continue

    const [match] = matches
    const title = titleFromProductSlug(match[1])
    if (!title) continue

    return { title, url: match[0] }
  }

  return null
}
