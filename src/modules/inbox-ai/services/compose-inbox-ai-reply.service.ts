import type { Store } from '../../stores/types/store.types.js'
import {
  buildProductReply,
  type ProductReplyResult,
} from './build-product-reply.service.js'
import {
  extractLastShownProduct,
  extractOpenOffer,
  filterSessionHistory,
  formatConversationHistory,
  type InboxAiChannel,
} from './conversation-history.service.js'
import { inboxAgentEnabled, runInboxAgent } from '../agent/run-inbox-agent.js'
import {
  parseCustomerIntent,
  parseCustomerIntentOffline,
  type ConversationHistoryLine,
  type ParsedCustomerIntent,
} from './parse-customer-intent.service.js'
import {
  formatShopCategories,
  getStoreCatalogSummary,
} from './catalog-search.service.js'
import type { LastShownProduct } from './build-localized-reply.service.js'
import {
  resolveStaffHandoff,
  staffConnectLine,
  type StaffHandoffAction,
} from './staff-handoff.service.js'

export type ComposeInboxAiReplyInput = {
  store: Store
  channel: InboxAiChannel
  customerText: string
  recentMessages?: ConversationHistoryLine[]
  customerPhone?: string | null
  conversationId?: number | null
  staffWarnedAt?: string | null
}

export type ComposeInboxAiReplyResult = {
  intent: ParsedCustomerIntent
  lastShownProduct: LastShownProduct | null
  reply: ProductReplyResult
  replyText: string
  wouldSendImage: boolean
  staffHandoff: StaffHandoffAction
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
  const recentMessages = filterSessionHistory(input.recentMessages ?? [])
  const conversationHistory = formatConversationHistory(recentMessages)
  const shopSells = formatShopCategories(await getStoreCatalogSummary(input.store.id))

  if (inboxAgentEnabled()) {
    const offline = parseCustomerIntentOffline(text, {
      recentMessages,
      storeCategories: shopSells,
    })
    if (input.staffWarnedAt) {
      const empty: ProductReplyResult = {
        primaryText: '',
        followUpText: null,
        matches: [],
        primaryMatch: null,
        imageUrl: null,
      }
      return {
        intent: offline,
        lastShownProduct: null,
        reply: empty,
        replyText: '',
        wouldSendImage: false,
        staffHandoff: 'wait',
      }
    }

    try {
      const agent = await runInboxAgent({
        store: input.store,
        channel: input.channel,
        customerText: text,
        recentMessages,
        customerPhone: input.customerPhone ?? null,
        conversationId: input.conversationId ?? null,
        shopSells,
      })
      if (agent) {
        const wouldSendImage =
          input.channel === 'whatsapp' && Boolean(agent.reply.imageUrl && agent.reply.primaryMatch)
        return {
          ...agent,
          replyText: formatReplyTextForChannel(input.channel, agent.reply),
          wouldSendImage,
        }
      }
    } catch (err) {
      console.error(
        '[inbox-ai-agent] falling back:',
        err instanceof Error ? err.message : err
      )
    }
  }

  const intent = await parseCustomerIntent(text, {
    recentMessages,
    storeCategories: shopSells,
  })
  const openOffer = intent.intent === 'buy_intent' ? extractOpenOffer(recentMessages) : null
  const lastShownProduct =
    intent.intent === 'greeting' || intent.rejectsLastShown
      ? null
      : openOffer
        ? { title: openOffer.title, url: openOffer.url }
        : extractLastShownProduct(recentMessages)

  const staffHandoff = await resolveStaffHandoff({
    store: input.store,
    intent,
    customerText: text,
    staffWarnedAt: input.staffWarnedAt,
    customerPhone: input.customerPhone ?? null,
    conversationId: input.conversationId ?? null,
  })

  if (staffHandoff === 'wait') {
    const empty: ProductReplyResult = {
      primaryText: '',
      followUpText: null,
      matches: [],
      primaryMatch: null,
      imageUrl: null,
    }
    return {
      intent,
      lastShownProduct,
      reply: empty,
      replyText: '',
      wouldSendImage: false,
      staffHandoff,
    }
  }

  if (staffHandoff === 'warn') {
    const line = staffConnectLine(intent.customerLanguage, intent.scriptStyle)
    const warned: ProductReplyResult = {
      primaryText: line,
      followUpText: null,
      matches: [],
      primaryMatch: null,
      imageUrl: null,
    }
    return {
      intent,
      lastShownProduct,
      reply: warned,
      replyText: line,
      wouldSendImage: false,
      staffHandoff,
    }
  }

  const reply = await buildProductReply({
    store: input.store,
    customerText: text,
    intent,
    conversationHistory,
    lastShownProduct,
    channel: input.channel,
    customerPhone: input.customerPhone ?? null,
    conversationId: input.conversationId ?? null,
    shopSells,
  })

  const wouldSendImage =
    input.channel === 'whatsapp' && Boolean(reply.imageUrl && reply.primaryMatch)

  return {
    intent,
    lastShownProduct,
    reply,
    replyText: formatReplyTextForChannel(input.channel, reply),
    wouldSendImage,
    staffHandoff,
  }
}
