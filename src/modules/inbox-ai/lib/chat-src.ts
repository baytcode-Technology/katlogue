import type { InboxAiChannel } from '../services/conversation-history.service.js'

const CHAT_SRC_RE = /^(wa|ig)_(\d+)$/i

export function buildChatSrc(
  channel: InboxAiChannel,
  conversationId: number
): string {
  const prefix = channel === 'instagram' ? 'ig' : 'wa'
  return `${prefix}_${conversationId}`
}

export function parseChatSrc(
  raw: string | null | undefined
): { channel: InboxAiChannel; conversationId: number } | null {
  const match = raw?.trim().match(CHAT_SRC_RE)
  if (!match) return null
  const conversationId = Number(match[2])
  if (!Number.isInteger(conversationId) || conversationId <= 0) return null
  return {
    channel: match[1].toLowerCase() === 'ig' ? 'instagram' : 'whatsapp',
    conversationId,
  }
}

export function appendSearchParam(url: string, key: string, value: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.set(key, value)
    return parsed.toString()
  } catch {
    const join = url.includes('?') ? '&' : '?'
    return `${url}${join}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
  }
}

export function applyChatSrcToUrl(
  url: string,
  channel?: InboxAiChannel | null,
  conversationId?: number | null
): string {
  if (!channel || conversationId == null || conversationId <= 0) return url
  return appendSearchParam(url, 'src', buildChatSrc(channel, conversationId))
}
