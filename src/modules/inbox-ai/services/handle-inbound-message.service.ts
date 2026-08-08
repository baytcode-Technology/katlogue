import { hasPremiumAccess } from '../../../shared/lib/subscription.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as whatsappChatRepository from '../../whatsapp/repositories/whatsapp-chat.repository.js'
import * as instagramChatRepository from '../../instagram/repositories/instagram-chat.repository.js'
import { scheduleDebouncedInboxAi } from '../debounce.js'
import { checkInboxAiRateLimit } from '../rate-limit.js'
import { isAiPaused } from '../repositories/conversation-ai.repository.js'
import { buildProductReply } from './build-product-reply.service.js'
import { parseCustomerIntent } from './parse-customer-intent.service.js'
import { sendAutoReplyInstagramText } from './send-auto-reply-instagram.service.js'
import {
  sendAutoReplyWhatsAppImage,
  sendAutoReplyWhatsAppText,
} from './send-auto-reply-whatsapp.service.js'

export type InboxAiChannel = 'whatsapp' | 'instagram'

export type HandleInboundInboxAiInput = {
  channel: InboxAiChannel
  storeId: number
  conversationId: number
  messageId: number
  textBody: string
  customerKey: string
}

async function shouldReply(input: HandleInboundInboxAiInput): Promise<boolean> {
  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) return false
  if (!hasPremiumAccess(store)) return false
  if (!store.ai_auto_reply_enabled) return false

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

  if (!conversation) return false
  if (conversation.reply_mode === 'manual') return false
  if (isAiPaused(conversation.ai_paused_until)) return false

  if (!checkInboxAiRateLimit(input.storeId, input.customerKey)) return false

  return true
}

async function processInbound(input: HandleInboundInboxAiInput): Promise<void> {
  const text = input.textBody.trim()
  if (!text) return

  if (!(await shouldReply(input))) return

  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) return

  const intent = await parseCustomerIntent(text)
  const reply = await buildProductReply({
    store,
    customerText: text,
    intent,
  })

  if (!reply.primaryText.trim()) return

  if (input.channel === 'whatsapp') {
    const conversation = await whatsappChatRepository.findConversationById({
      storeId: input.storeId,
      conversationId: input.conversationId,
    })
    if (!conversation) return

    if (reply.imageUrl && reply.primaryMatch) {
      await sendAutoReplyWhatsAppImage({
        storeId: input.storeId,
        conversationId: input.conversationId,
        customerWaNumber: conversation.customer_wa_number,
        imageUrl: reply.imageUrl,
        caption: reply.primaryText.slice(0, 900),
      })

      if (reply.followUpText?.trim()) {
        await sendAutoReplyWhatsAppText({
          storeId: input.storeId,
          conversationId: input.conversationId,
          customerWaNumber: conversation.customer_wa_number,
          message: reply.followUpText,
        })
      }
      return
    }

    await sendAutoReplyWhatsAppText({
      storeId: input.storeId,
      conversationId: input.conversationId,
      customerWaNumber: conversation.customer_wa_number,
      message: reply.primaryText,
    })

    if (reply.followUpText?.trim()) {
      await sendAutoReplyWhatsAppText({
        storeId: input.storeId,
        conversationId: input.conversationId,
        customerWaNumber: conversation.customer_wa_number,
        message: reply.followUpText,
      })
    }
    return
  }

  const igConversation = await instagramChatRepository.findConversationById({
    storeId: input.storeId,
    conversationId: input.conversationId,
  })
  if (!igConversation) return

  const igText = reply.followUpText
    ? `${reply.primaryText}\n\n${reply.followUpText}`
    : reply.primaryText

  await sendAutoReplyInstagramText({
    storeId: input.storeId,
    conversationId: input.conversationId,
    customerIgId: igConversation.customer_ig_id,
    message: igText,
  })
}

export function handleInboundInboxAi(input: HandleInboundInboxAiInput): void {
  const debounceKey = `${input.channel}:${input.storeId}:${input.conversationId}`
  scheduleDebouncedInboxAi(debounceKey, input.messageId, async () => {
    await processInbound(input)
  })
}

export { pauseInboxAiForConversation, updateConversationReplyMode } from '../repositories/conversation-ai.repository.js'
