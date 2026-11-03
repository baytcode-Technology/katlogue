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
  markStaffWaiting,
  markStaffWarned,
  tryMarkAiDisclosureSent,
} from '../repositories/conversation-ai.repository.js'
import {
  notifyInstagramChat,
  notifyWhatsAppChat,
} from '../../notifications/services/send-store-notification.service.js'
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

async function resolveLatestInboundText(
  input: HandleInboundInboxAiInput
): Promise<{ messageId: number; textBody: string } | null> {
  try {
    if (input.channel === 'whatsapp') {
      const messages = await whatsappChatRepository.listMessages({
        storeId: input.storeId,
        conversationId: input.conversationId,
        limit: 20,
      })
      const inbound = messages.find((message) => {
        if (message.direction !== 'inbound') return false
        return Boolean(message.text_body?.trim() || message.caption?.trim())
      })
      if (!inbound) return null
      return {
        messageId: inbound.id,
        textBody: (inbound.text_body ?? inbound.caption ?? '').trim(),
      }
    }

    const messages = await instagramChatRepository.listMessages({
      storeId: input.storeId,
      conversationId: input.conversationId,
      limit: 20,
    })
    const inbound = messages.find((message) => {
      if (message.direction !== 'inbound') return false
      return Boolean(message.text_body?.trim() || message.caption?.trim())
    })
    if (!inbound) return null
    return {
      messageId: inbound.id,
      textBody: (inbound.text_body ?? inbound.caption ?? '').trim(),
    }
  } catch (err) {
    console.warn('[inbox-ai] latest inbound refetch failed — using captured text', err)
    return null
  }
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
      staffWarnedAt: conversation.staff_warned_at,
    })

    const { intent, lastShownProduct, reply, staffHandoff } = composed

    if (staffHandoff === 'warn' || staffHandoff === 'policy') {
      await markStaffWarned({
        channel: input.channel,
        storeId: input.storeId,
        conversationId: input.conversationId,
      })
    }

    if (staffHandoff === 'wait') {
      await markStaffWaiting({
        channel: input.channel,
        storeId: input.storeId,
        conversationId: input.conversationId,
      })
      await emitConversationStaffState(input)
      await notifyOwnerWaiting(store, conversation, input)
      return
    }

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

    // Send a one-time disclosure before the first AI reply in a conversation.
    if (!conversation.ai_disclosure_sent) {
      const didMark = await tryMarkAiDisclosureSent({
        channel: input.channel,
        storeId: input.storeId,
        conversationId: input.conversationId,
      })

      if (didMark) {
        const disclosureText = `You're chatting with ${store.name ?? 'us'}. Some replies may be generated by AI.`

        if (input.channel === 'whatsapp') {
          const waConversation = conversation as WhatsAppConversation
          await sendAutoReplyWhatsAppText({
            storeId: input.storeId,
            conversationId: input.conversationId,
            customerWaNumber: waConversation.customer_wa_number,
            message: disclosureText,
          })
        } else {
          const igConversation = conversation as InstagramConversation
          await sendAutoReplyInstagramText({
            storeId: input.storeId,
            conversationId: input.conversationId,
            customerIgId: igConversation.customer_ig_id,
            message: disclosureText,
          })
        }
      }
    }

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

async function emitConversationStaffState(input: HandleInboundInboxAiInput): Promise<void> {
  if (input.channel === 'whatsapp') {
    const conversation = await whatsappChatRepository.findConversationById({
      storeId: input.storeId,
      conversationId: input.conversationId,
    })
    if (!conversation) return
    emitToStore(input.storeId, SOCKET_EVENTS.CONVERSATION_UPDATED, {
      storeId: input.storeId,
      conversation: {
        id: conversation.id,
        customer_wa_number: conversation.customer_wa_number,
        last_message_at: conversation.last_message_at,
        last_message_preview: conversation.last_message_preview,
        unread_count: conversation.unread_count,
        reply_mode: conversation.reply_mode,
        ai_paused_until: conversation.ai_paused_until,
        staff_waiting_at: conversation.staff_waiting_at,
        staff_warned_at: conversation.staff_warned_at,
      },
    })
    return
  }

  const conversation = await instagramChatRepository.findConversationById({
    storeId: input.storeId,
    conversationId: input.conversationId,
  })
  if (!conversation) return
  emitToStore(input.storeId, SOCKET_EVENTS.INSTAGRAM_CONVERSATION_UPDATED, {
    storeId: input.storeId,
    conversation: {
      id: conversation.id,
      customer_ig_id: conversation.customer_ig_id,
      customer_ig_username: conversation.customer_ig_username,
      last_message_at: conversation.last_message_at,
      last_message_preview: conversation.last_message_preview,
      unread_count: conversation.unread_count,
      reply_mode: conversation.reply_mode,
      ai_paused_until: conversation.ai_paused_until,
      staff_waiting_at: conversation.staff_waiting_at,
      staff_warned_at: conversation.staff_warned_at,
    },
  })
}

async function notifyOwnerWaiting(
  store: Store,
  conversation: WhatsAppConversation | InstagramConversation,
  input: HandleInboundInboxAiInput
): Promise<void> {
  try {
    if (input.channel === 'whatsapp' && 'customer_wa_number' in conversation) {
      await notifyWhatsAppChat({
        storeId: store.id,
        storeSlug: store.slug,
        conversationId: conversation.id,
        preview: 'Waiting for your reply',
        senderLabel: conversation.customer_name?.trim() || conversation.customer_wa_number,
        customerPhone: conversation.customer_wa_number,
        title: 'Customer waiting',
      })
      return
    }
    if ('customer_ig_id' in conversation) {
      await notifyInstagramChat({
        storeId: store.id,
        storeSlug: store.slug,
        conversationId: conversation.id,
        preview: 'Waiting for your reply',
        username: conversation.customer_ig_username,
        customerIgId: conversation.customer_ig_id,
        title: 'Customer waiting',
      })
    }
  } catch (err) {
    console.error('[notifications] staff waiting push failed', err)
  }
}

export function handleInboundInboxAi(input: HandleInboundInboxAiInput): void {
  const debounceKey = `${input.channel}:${input.storeId}:${input.conversationId}`
  scheduleDebouncedInboxAi(debounceKey, input.messageId, async () => {
    const latest = await resolveLatestInboundText(input)
    await processInbound({
      ...input,
      messageId: latest?.messageId ?? input.messageId,
      textBody: latest?.textBody || input.textBody,
    })
  })
}

export {
  clearAiPauseForConversation,
  pauseInboxAiForConversation,
  updateConversationReplyMode,
} from '../repositories/conversation-ai.repository.js'
