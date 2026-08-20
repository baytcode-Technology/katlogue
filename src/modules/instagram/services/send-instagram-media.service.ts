import { AppError } from '../../../shared/errors/app.error.js'
import * as customerRepository from '../../customers/repositories/customer.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { pauseInboxAiForConversation } from '../../inbox-ai/index.js'
import * as chatRepository from '../repositories/instagram-chat.repository.js'
import {
  isInstagramReadyForStore,
  resolveStoreInstagramCredentials,
  sendInstagramAttachmentMessage,
  sendInstagramTextMessage,
} from './instagram-api.service.js'
import {
  emitInstagramConversationUpdated,
  emitInstagramNewMessage,
} from './process-instagram-webhook.service.js'

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000

async function assertWithinSessionWindow(input: {
  storeId: number
  customerIgId: string
}) {
  const lastInbound = await chatRepository.getLastInboundMessageAt({
    storeId: input.storeId,
    customerIgId: input.customerIgId,
  })

  if (!lastInbound) return

  const elapsed = Date.now() - new Date(lastInbound).getTime()
  if (elapsed > SESSION_WINDOW_MS) {
    throw new AppError(
      403,
      'Outside the 24-hour Instagram messaging window. Wait for the customer to message again.',
      'INSTAGRAM_SESSION_EXPIRED'
    )
  }
}

function previewForType(type: string, caption?: string | null): string {
  if (caption?.trim()) return caption.trim()
  if (type === 'image') return 'Photo'
  if (type === 'video') return 'Video'
  if (type === 'audio') return 'Voice message'
  return `[${type}]`
}

export type SendInstagramMediaInput = {
  storeId: number
  ownerId: string
  to: string
  type: 'image' | 'audio' | 'video'
  mediaUrl: string
  mimeType?: string | null
  caption?: string | null
  conversationId?: number | null
}

export async function sendInstagramMediaMessageService(input: SendInstagramMediaInput) {
  await storeRepository.assertStoreMember(input.storeId, input.ownerId)

  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  if (!isInstagramReadyForStore(store)) {
    throw new AppError(503, 'Instagram is not connected for this store', 'INSTAGRAM_NOT_CONFIGURED')
  }

  const credentials = resolveStoreInstagramCredentials(store)!
  const customerIgId = input.to.trim()
  const mediaUrl = input.mediaUrl.trim()
  if (!mediaUrl) {
    throw new AppError(400, 'mediaUrl is required', 'INSTAGRAM_MEDIA_URL_REQUIRED')
  }

  let conversation =
    (input.conversationId
      ? await chatRepository.findConversationById({
          storeId: input.storeId,
          conversationId: input.conversationId,
        })
      : null) ??
    (await chatRepository.findConversationByCustomer({
      storeId: input.storeId,
      customerIgId,
    }))

  const customerUsername = conversation?.customer_ig_username ?? null
  const customer = await customerRepository.findOrCreateByInstagram(input.storeId, customerIgId, {
    username: customerUsername,
  })

  await assertWithinSessionWindow({ storeId: input.storeId, customerIgId })

  const metaResult = await sendInstagramAttachmentMessage({
    igUserId: credentials.igUserId,
    accessToken: credentials.accessToken,
    recipientIgId: customerIgId,
    type: input.type,
    url: mediaUrl,
  })

  const caption = input.caption?.trim() || null
  if (caption) {
    try {
      await sendInstagramTextMessage({
        igUserId: credentials.igUserId,
        accessToken: credentials.accessToken,
        recipientIgId: customerIgId,
        message: caption,
      })
    } catch (err) {
      console.warn('[instagram] caption text send failed after media', err)
    }
  }

  const now = new Date().toISOString()
  const preview = previewForType(input.type, caption)

  conversation = await chatRepository.upsertConversation({
    storeId: input.storeId,
    customerIgId,
    customerIgUsername: customerUsername,
    customerId: customer.id,
    lastMessageAt: now,
    lastMessagePreview: preview,
  })

  const saved = await chatRepository.insertMessage({
    storeId: input.storeId,
    conversationId: conversation.id,
    metaMessageId: metaResult.metaMessageId,
    direction: 'outbound',
    fromIgId: credentials.igUserId,
    toIgId: customerIgId,
    type: input.type,
    textBody: caption ?? preview,
    mediaUrl,
    mimeType: input.mimeType ?? null,
    caption,
    status: 'sent',
    rawPayload: metaResult.raw,
    timestamp: now,
  })

  if (!saved) {
    throw new AppError(500, 'Failed to persist outbound media message', 'INSTAGRAM_MESSAGE_SAVE_FAILED')
  }

  emitInstagramNewMessage(input.storeId, conversation.id, saved)
  emitInstagramConversationUpdated(input.storeId, conversation)

  void pauseInboxAiForConversation({
    channel: 'instagram',
    storeId: input.storeId,
    conversationId: conversation.id,
  })

  return {
    conversation,
    message: saved,
    metaMessageId: metaResult.metaMessageId,
  }
}
