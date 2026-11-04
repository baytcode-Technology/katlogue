import * as instagramChatRepository from '../../instagram/repositories/instagram-chat.repository.js'
import * as whatsappChatRepository from '../../whatsapp/repositories/whatsapp-chat.repository.js'
import type { ConversationHistoryLine } from './parse-customer-intent.service.js'

const HISTORY_LIMIT = 6

/** A later "hi" must not revive a product from days ago. Follow-ups stay in this window. */
export const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000

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
    .map((m): ConversationHistoryLine | null => {
      const caption = 'caption' in m ? m.caption : null
      const textBody = 'text_body' in m ? m.text_body : null
      const text = (caption ?? textBody) ?? ''
      const trimmed = String(text).trim()
      if (!trimmed) return null
      const role: ConversationHistoryLine['role'] =
        m.direction === 'inbound' ? 'customer' : 'store'
      const at: string | null = m.timestamp ?? m.created_at ?? null
      return { role, text: trimmed, at }
    })
    .filter((line): line is ConversationHistoryLine => line !== null)
}

export function formatConversationHistory(lines: ConversationHistoryLine[]): string | null {
  if (lines.length === 0) return null
  return lines.map((l) => `${l.role === 'customer' ? 'Customer' : 'Store'}: ${l.text}`).join('\n')
}

/**
 * Drop chat from before this visit. Lines with no timestamp are kept so older
 * callers that only pass text still work.
 */
export function filterSessionHistory(
  lines: ConversationHistoryLine[],
  nowMs: number = Date.now()
): ConversationHistoryLine[] {
  return lines.filter((line) => {
    if (!line.at) return true
    const time = Date.parse(line.at)
    if (Number.isNaN(time)) return true
    return nowMs - time <= SESSION_MAX_AGE_MS
  })
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

export type OpenOffer = {
  title: string
  url: string
  /** The question we asked about that product, word for word. */
  question: string
}

function questionAfter(text: string, fromIndex: number): string | null {
  const lines = text
    .slice(fromIndex)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('?'))
  return lines[lines.length - 1] ?? null
}

/**
 * The product we offered in our latest turn, when we ended it with a question
 * ("Would you like to order it?"). A newer store turn without that offer closes it.
 */
export function extractOpenOffer(lines: ConversationHistoryLine[]): OpenOffer | null {
  let i = lines.length - 1
  while (i >= 0 && lines[i].role === 'customer') i -= 1
  const lastTurn: ConversationHistoryLine[] = []
  while (i >= 0 && lines[i].role === 'store') {
    lastTurn.unshift(lines[i])
    i -= 1
  }

  for (const line of lastTurn) {
    const matches = [...line.text.matchAll(PRODUCT_URL_PATTERN)]
    if (matches.length !== 1) continue
    const [match] = matches
    const title = titleFromProductSlug(match[1])
    const question = questionAfter(line.text, (match.index ?? 0) + match[0].length)
    if (!title || !question) continue
    return { title, url: match[0], question }
  }
  return null
}

export type SessionTopic = 'order' | 'product' | 'missing' | null

/** What the shop last talked about in this visit, so "ok" does not start a new sale. */
export function detectSessionTopic(lines: ConversationHistoryLine[]): SessionTopic {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]
    if (line.role !== 'store') continue
    const text = line.text
    if (
      /\bOrder number\s*:/i.test(text) ||
      /\border status\b/i.test(text) ||
      /\border\s+[A-Z]{3}\d{2}-\d+\b/i.test(text) ||
      /\b[A-Z]{3}\d{2}-\d+\b/.test(text)
    ) {
      return 'order'
    }
    if (/https?:\/\/\S*\/product\//i.test(text)) return 'product'
    if (/\b(illa|don't keep|do not (?:keep|sell)|not available)\b/i.test(text)) return 'missing'
  }
  return null
}
