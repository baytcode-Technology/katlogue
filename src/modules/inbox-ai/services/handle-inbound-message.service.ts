import { hasPremiumAccess } from '../../../shared/lib/subscription.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as whatsappChatRepository from '../../whatsapp/repositories/whatsapp-chat.repository.js'
import * as instagramChatRepository from '../../instagram/repositories/instagram-chat.repository.js'
import { scheduleDebouncedInboxAi } from '../debounce.js'
import { checkInboxAiRateLimit } from '../rate-limit.js'
import { isAiPaused } from '../repositories/conversation-ai.repository.js'
import { buildAutoReplyText } from './build-auto-reply.service.js'
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
  const { text: replyText, matches, wantsImage } = await buildAutoReplyText({
    store,
    customerText: text,
    intent,
  })

  if (!replyText.trim()) return

  if (input.channel === 'whatsapp') {
    const conversation = await whatsappChatRepository.findConversationById({
      storeId: input.storeId,
      conversationId: input.conversationId,
    })
    if (!conversation) return

    if (wantsImage && matches.length === 1) {
      const imageUrl =
        matches[0].variant?.image_url ??
        matches[0].product.thumbnail_url ??
        matches[0].product.images?.[0]
      if (imageUrl) {
        await sendAutoReplyWhatsAppImage({
          storeId: input.storeId,
          conversationId: input.conversationId,
          customerWaNumber: conversation.customer_wa_number,
          imageUrl,
          caption: replyText.slice(0, 900),
        })
        return
      }
    }

    await sendAutoReplyWhatsAppText({
      storeId: input.storeId,
      conversationId: input.conversationId,
      customerWaNumber: conversation.customer_wa_number,
      message: replyText,
    })
    return
  }

  const igConversation = await instagramChatRepository.findConversationById({
    storeId: input.storeId,
    conversationId: input.conversationId,
  })
  if (!igConversation) return

  await sendAutoReplyInstagramText({
    storeId: input.storeId,
    conversationId: input.conversationId,
    customerIgId: igConversation.customer_ig_id,
    message: replyText,
  })
}

export function handleInboundInboxAi(input: HandleInboundInboxAiInput): void {
  const debounceKey = `${input.channel}:${input.storeId}:${input.conversationId}`
  scheduleDebouncedInboxAi(debounceKey, input.messageId, async () => {
    await processInbound(input)
  })
}

export { pauseInboxAiForConversation, updateConversationReplyMode } from '../repositories/conversation-ai.repository.js'
