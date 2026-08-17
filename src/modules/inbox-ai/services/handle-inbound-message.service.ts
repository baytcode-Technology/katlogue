import { hasPremiumAccess } from '../../../shared/lib/subscription.js'

import * as storeRepository from '../../stores/repositories/store.repository.js'

import * as whatsappChatRepository from '../../whatsapp/repositories/whatsapp-chat.repository.js'

import * as instagramChatRepository from '../../instagram/repositories/instagram-chat.repository.js'

import type { WhatsAppConversation } from '../../whatsapp/types/whatsapp-chat.types.js'

import type { InstagramConversation } from '../../instagram/types/instagram-chat.types.js'

import type { Store } from '../../stores/types/store.types.js'

import { scheduleDebouncedInboxAi } from '../debounce.js'

import { checkInboxAiRateLimit } from '../rate-limit.js'

import { isAiPaused } from '../repositories/conversation-ai.repository.js'

import { buildProductReply } from './build-product-reply.service.js'

import {

  fetchRecentConversationHistory,

  formatConversationHistory,

  type InboxAiChannel,

} from './conversation-history.service.js'

import { parseCustomerIntent } from './parse-customer-intent.service.js'

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

  if (conversation.reply_mode === 'manual') return null

  if (isAiPaused(conversation.ai_paused_until)) return null



  if (!checkInboxAiRateLimit(input.storeId, input.customerKey)) return null



  return { store, conversation }

}



async function processInbound(input: HandleInboundInboxAiInput): Promise<void> {

  const text = input.textBody.trim()

  if (!text) return



  const replyContext = await loadReplyContext(input)

  if (!replyContext) return



  const { store, conversation } = replyContext



  const recentMessages = await fetchRecentConversationHistory({

    channel: input.channel,

    storeId: input.storeId,

    conversationId: input.conversationId,

  })

  const conversationHistory = formatConversationHistory(recentMessages)



  const intent = await parseCustomerIntent(text, { recentMessages })

  const customerPhone =

    input.channel === 'whatsapp' && 'customer_wa_number' in conversation

      ? conversation.customer_wa_number

      : null



  const reply = await buildProductReply({

    store,

    customerText: text,

    intent,

    conversationHistory,

    channel: input.channel,

    customerPhone,

    conversationId: input.conversationId,

  })



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

}



export function handleInboundInboxAi(input: HandleInboundInboxAiInput): void {

  const debounceKey = `${input.channel}:${input.storeId}:${input.conversationId}`

  scheduleDebouncedInboxAi(debounceKey, input.messageId, async () => {

    await processInbound(input)

  })

}



export { pauseInboxAiForConversation, updateConversationReplyMode } from '../repositories/conversation-ai.repository.js'

