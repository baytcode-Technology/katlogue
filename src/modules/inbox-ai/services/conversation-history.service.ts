import * as instagramChatRepository from '../../instagram/repositories/instagram-chat.repository.js'
import * as whatsappChatRepository from '../../whatsapp/repositories/whatsapp-chat.repository.js'
import type { ConversationHistoryLine } from './parse-customer-intent.service.js'

/** Enough of this visit to still see the last product card after a few size replies. */
const SESSION_FETCH_LIMIT = 20

/** What the model reads. Keeps the prompt the same size as before. */
const MODEL_HISTORY_LINES = 6

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
          limit: SESSION_FETCH_LIMIT,
        })
      : await instagramChatRepository.listMessages({
          storeId: input.storeId,
          conversationId: input.conversationId,
          limit: SESSION_FETCH_LIMIT,
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
  return lines
    .slice(-MODEL_HISTORY_LINES)
    .map((l) => `${l.role === 'customer' ? 'Customer' : 'Store'}: ${l.text}`)
    .join('\n')
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

const ALSO_LIST_HEADER =
  /ithupole vereyum ind|we also have|i also found these|ഇതുപോലെ വേറെയും ഉണ്ട്/i

function isAlsoListText(text: string): boolean {
  return ALSO_LIST_HEADER.test(text)
}

function productRefFromStoreText(text: string): LastShownProductRef | null {
  if (isAlsoListText(text)) return null
  const matches = [...text.matchAll(PRODUCT_URL_PATTERN)]
  if (matches.length === 0) return null
  const match = matches[0]
  const title = titleFromProductSlug(match[1])
  if (!title) return null
  return { title, url: match[0] }
}

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
    const found = productRefFromStoreText(line.text)
    if (found) return found
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

const BOOK_ASK =
  /\b(book\s+cheyy\w*|order\s+cheyy\w*|ithu\s+book|bood\s+cheyy\w*|would you like to (?:place an )?order|shall i book|want to (?:buy|order)|order cheyyano)\b/i

function bookAskQuestion(text: string): string | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (BOOK_ASK.test(lines[i])) return lines[i]
  }
  return null
}

/**
 * The product we offered in our latest turn, when we asked to book/order.
 * URL and question may be in different store bubbles of the same visit.
 * A newer store turn with no book ask closes the offer.
 */
export function extractOpenOffer(lines: ConversationHistoryLine[]): OpenOffer | null {
  let i = lines.length - 1
  while (i >= 0 && lines[i].role === 'customer') i -= 1
  const lastTurn: ConversationHistoryLine[] = []
  while (i >= 0 && lines[i].role === 'store') {
    lastTurn.unshift(lines[i])
    i -= 1
  }
  if (lastTurn.length === 0) return null

  for (const line of lastTurn) {
    if (isAlsoListText(line.text)) continue
    const matches = [...line.text.matchAll(PRODUCT_URL_PATTERN)]
    if (matches.length === 0) continue
    const [match] = matches
    const title = titleFromProductSlug(match[1])
    const question = questionAfter(line.text, (match.index ?? 0) + match[0].length)
    if (!title || !question) continue
    return { title, url: match[0], question }
  }

  let question: string | null = null
  for (let j = lastTurn.length - 1; j >= 0; j -= 1) {
    if (isAlsoListText(lastTurn[j].text)) continue
    question = bookAskQuestion(lastTurn[j].text)
    if (question) break
  }
  const ask = question
  if (!ask) return null
  const product = extractLastShownProduct(lines)
  if (!product?.url) return null
  return { title: product.title, url: product.url, question: ask }
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
