import { hasPremiumAccess } from '../../../shared/lib/subscription.js'
import type { Order, OrderItem } from '../../orders/types/order.types.js'
import type { Store } from '../../stores/types/store.types.js'
import * as instagramChatRepository from '../../instagram/repositories/instagram-chat.repository.js'
import * as whatsappChatRepository from '../../whatsapp/repositories/whatsapp-chat.repository.js'
import { parseOrderItemSnapshot } from './build-order-reply.service.js'
import { sendAutoReplyInstagramText } from './send-auto-reply-instagram.service.js'
import { sendAutoReplyWhatsAppText } from './send-auto-reply-whatsapp.service.js'

function firstProductLabel(items: OrderItem[]): string {
  const first = items[0]
  if (!first) return 'your items'
  const parsed = parseOrderItemSnapshot(first)
  if (parsed.variantName) return `${parsed.productName} (${parsed.variantName})`
  return parsed.productName
}

export async function sendOrderPlacedChatConfirm(input: {
  store: Store
  order: Order
  items: OrderItem[]
  conversationId: number
}): Promise<void> {
  if (!hasPremiumAccess(input.store) || !input.store.ai_auto_reply_enabled) return

  const wa = await whatsappChatRepository.findConversationById({
    storeId: input.store.id,
    conversationId: input.conversationId,
  })
  const ig = wa
    ? null
    : await instagramChatRepository.findConversationById({
        storeId: input.store.id,
        conversationId: input.conversationId,
      })

  const conversation = wa ?? ig
  if (!conversation) return
  if (conversation.reply_mode === 'manual') return

  const product = firstProductLabel(input.items)
  const message = `Got it — order ${input.order.order_number} for ${product} is in. We'll update you once it ships.`

  if (wa && 'customer_wa_number' in wa) {
    await sendAutoReplyWhatsAppText({
      storeId: input.store.id,
      conversationId: wa.id,
      customerWaNumber: wa.customer_wa_number,
      message,
    })
    return
  }

  if (ig) {
    await sendAutoReplyInstagramText({
      storeId: input.store.id,
      conversationId: ig.id,
      customerIgId: ig.customer_ig_id,
      message,
    })
  }
}
