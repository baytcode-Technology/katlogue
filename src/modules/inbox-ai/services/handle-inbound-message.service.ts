import { hasPremiumAccess } from '../../../shared/lib/subscription.js'
import { emitToStore } from '../../../websocket/index.js'
import { SOCKET_EVENTS } from '../../../websocket/events.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as whatsappChatRepository from '../../whatsapp/repositories/whatsapp-chat.repository.js'
import * as instagramChatRepository from '../../instagram/repositories/instagram-chat.repository.js'
import type { WhatsAppConversation } from '../../whatsapp/types/whatsapp-chat.types.js'
import type { InstagramConversation } from '../../instagram/types/instagram-chat.types.js'
import type { Store } from '../../stores/types/store.types.js'
import { scheduleDebouncedInboxAi } from '../debounce.js'
import { checkInboxAiRateLimit } from '../rate-limit.js'
import {
  clearAiPauseForConversation,
  isAiPaused,
} from '../repositories/conversation-ai.repository.js'
import { composeInboxAiReply } from './compose-inbox-ai-reply.service.js'
import {
  fetchRecentConversationHistory,
  type InboxAiChannel,
} from './conversation-history.service.js'
import { sendAutoReplyInstagramText } from './send-auto-reply-instagram.service.js'
import {
  sendAutoReplyWhatsAppImage,
  sendAutoReplyWhatsAppText,
} from './send-auto-reply-whatsapp.service.js'

export type { InboxAiChannel } from './conversation-history.service.js'

export type HandleInboundInboxAiInput = {
  channel: InboxAiChannel
  storeId: number
  conversationId: number
  messageId: number
  textBody: string
  customerKey: string
}

type ReplyContext = {
  store: Store
  conversation: WhatsAppConversation | InstagramConversation
}

function emitInboxAiTyping(input: HandleInboundInboxAiInput, typing: boolean): void {
  emitToStore(input.storeId, SOCKET_EVENTS.INBOX_AI_TYPING, {
    storeId: input.storeId,
    conversationId: input.conversationId,
    channel: input.channel,
    typing,
  })
}

async function loadReplyContext(input: HandleInboundInboxAiInput): Promise<ReplyContext | null> {
  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) return null
  if (!hasPremiumAccess(store)) return null
  if (!store.ai_auto_reply_enabled) return null

  const conversation =
    input.channel === 'whatsapp'
      ? await whatsappChatRepository.findConversationById({
          storeId: input.storeId,
          conversationId: input.conversationId,
        })
      : await instagramChatRepository.findConversationById({
          storeId: input.storeId,
          conversationId: input.conversationId,
        })

  if (!conversation) return null
  if (conversation.reply_mode === 'manual') {
    console.info(
      '[inbox-ai] skip store=%d conversation=%d reason=manual_mode',
      input.storeId,
      input.conversationId
    )
    return null
  }

  let activeConversation = conversation
  if (isAiPaused(conversation.ai_paused_until)) {
    await clearAiPauseForConversation({
      channel: input.channel,
      storeId: input.storeId,
      conversationId: input.conversationId,
    })
    activeConversation = { ...conversation, ai_paused_until: null }
    console.info(
      '[inbox-ai] cleared pause store=%d conversation=%d reason=customer_inbound',
      input.storeId,
      input.conversationId
    )
  }

  if (!checkInboxAiRateLimit(input.storeId, input.customerKey)) return null

  return { store, conversation: activeConversation }
}

async function processInbound(input: HandleInboundInboxAiInput): Promise<void> {
  const text = input.textBody.trim()
  if (!text) return

  const replyContext = await loadReplyContext(input)
  if (!replyContext) return

  emitInboxAiTyping(input, true)

  try {
    const { store, conversation } = replyContext

    const recentMessages = await fetchRecentConversationHistory({
      channel: input.channel,
      storeId: input.storeId,
      conversationId: input.conversationId,
    })

    const customerPhone =
      input.channel === 'whatsapp' && 'customer_wa_number' in conversation
        ? conversation.customer_wa_number
        : null

    const composed = await composeInboxAiReply({
      store,
      channel: input.channel,
      customerText: text,
      recentMessages,
      customerPhone,
      conversationId: input.conversationId,
    })

    const { intent, lastShownProduct, reply } = composed

    console.info(
      '[inbox-ai] %s store=%d conversation=%d intent=%s lang=%s script=%s query=%s category=%s color=%s lastShown=%s',
      input.channel,
      input.storeId,
      input.conversationId,
      intent.intent,
      intent.customerLanguage,
      intent.scriptStyle,
      intent.searchQuery || 'none',
      intent.categoryName ?? 'none',
      intent.color ?? 'none',
      lastShownProduct?.title ?? 'none'
    )

    if (!reply.primaryText.trim()) return

    if (input.channel === 'whatsapp') {
      const waConversation = conversation as WhatsAppConversation

      if (reply.imageUrl && reply.primaryMatch) {
        await sendAutoReplyWhatsAppImage({
          storeId: input.storeId,
          conversationId: input.conversationId,
          customerWaNumber: waConversation.customer_wa_number,
          imageUrl: reply.imageUrl,
          caption: reply.primaryText.slice(0, 900),
        })

        if (reply.followUpText?.trim()) {
          await sendAutoReplyWhatsAppText({
            storeId: input.storeId,
            conversationId: input.conversationId,
            customerWaNumber: waConversation.customer_wa_number,
            message: reply.followUpText,
          })
        }
        return
      }

      await sendAutoReplyWhatsAppText({
        storeId: input.storeId,
        conversationId: input.conversationId,
        customerWaNumber: waConversation.customer_wa_number,
        message: reply.primaryText,
      })

      if (reply.followUpText?.trim()) {
        await sendAutoReplyWhatsAppText({
          storeId: input.storeId,
          conversationId: input.conversationId,
          customerWaNumber: waConversation.customer_wa_number,
          message: reply.followUpText,
        })
      }
      return
    }

    const igConversation = conversation as InstagramConversation
    const igText = reply.followUpText
      ? `${reply.primaryText}\n\n${reply.followUpText}`
      : reply.primaryText

    await sendAutoReplyInstagramText({
      storeId: input.storeId,
      conversationId: input.conversationId,
      customerIgId: igConversation.customer_ig_id,
      message: igText,
    })
  } finally {
    emitInboxAiTyping(input, false)
  }
}

export function handleInboundInboxAi(input: HandleInboundInboxAiInput): void {
  const debounceKey = `${input.channel}:${input.storeId}:${input.conversationId}`
  scheduleDebouncedInboxAi(debounceKey, input.messageId, async () => {
    await processInbound(input)
  })
}

export {
  clearAiPauseForConversation,
  pauseInboxAiForConversation,
  updateConversationReplyMode,
} from '../repositories/conversation-ai.repository.js'
