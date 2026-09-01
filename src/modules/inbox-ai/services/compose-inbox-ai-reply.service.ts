import type { Store } from '../../stores/types/store.types.js'
import {
  buildProductReply,
  type ProductReplyResult,
} from './build-product-reply.service.js'
import {
  extractLastShownProduct,
  formatConversationHistory,
  type InboxAiChannel,
} from './conversation-history.service.js'
import {
  parseCustomerIntent,
  type ConversationHistoryLine,
  type ParsedCustomerIntent,
} from './parse-customer-intent.service.js'
import type { LastShownProduct } from './build-localized-reply.service.js'

export type ComposeInboxAiReplyInput = {
  store: Store
  channel: InboxAiChannel
  customerText: string
  recentMessages?: ConversationHistoryLine[]
  customerPhone?: string | null
  conversationId?: number | null
}

export type ComposeInboxAiReplyResult = {
  intent: ParsedCustomerIntent
  lastShownProduct: LastShownProduct | null
  reply: ProductReplyResult
  replyText: string
  wouldSendImage: boolean
}

function formatReplyTextForChannel(
  channel: InboxAiChannel,
  reply: ProductReplyResult
): string {
  if (channel === 'instagram') {
    return reply.followUpText?.trim()
      ? `${reply.primaryText.trim()}\n\n${reply.followUpText.trim()}`
      : reply.primaryText.trim()
  }

  const parts = [reply.primaryText.trim()]
  if (reply.followUpText?.trim()) {
    parts.push(reply.followUpText.trim())
  }
  return parts.filter(Boolean).join('\n\n')
}

export async function composeInboxAiReply(
  input: ComposeInboxAiReplyInput
): Promise<ComposeInboxAiReplyResult> {
  const text = input.customerText.trim()
  const recentMessages = input.recentMessages ?? []
  const conversationHistory = formatConversationHistory(recentMessages)

  const intent = await parseCustomerIntent(text, { recentMessages })
  const lastShownProduct = extractLastShownProduct(recentMessages)

  const reply = await buildProductReply({
    store: input.store,
    customerText: text,
    intent,
    conversationHistory,
    lastShownProduct,
    channel: input.channel,
    customerPhone: input.customerPhone ?? null,
    conversationId: input.conversationId ?? null,
  })

  const wouldSendImage =
    input.channel === 'whatsapp' && Boolean(reply.imageUrl && reply.primaryMatch)

  return {
    intent,
    lastShownProduct,
    reply,
    replyText: formatReplyTextForChannel(input.channel, reply),
    wouldSendImage,
  }
}
