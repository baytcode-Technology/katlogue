import { AppError } from '../../../shared/errors/app.error.js'
import * as customerRepository from '../../customers/repositories/customer.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as chatRepository from '../repositories/instagram-chat.repository.js'
import { pauseInboxAiForConversation } from '../../inbox-ai/index.js'
import {
  isInstagramReadyForStore,
  resolveStoreInstagramCredentials,
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

export type SendInstagramTextInput = {
  storeId: number
  ownerId: string
  to: string
  message: string
  conversationId?: number | null
}

export async function sendInstagramTextMessageService(input: SendInstagramTextInput) {
  await storeRepository.assertStoreMember(input.storeId, input.ownerId)

  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  if (!isInstagramReadyForStore(store)) {
    throw new AppError(503, 'Instagram is not connected for this store', 'INSTAGRAM_NOT_CONFIGURED')
  }

  const credentials = resolveStoreInstagramCredentials(store)!
  const customerIgId = input.to.trim()
  const message = input.message.trim()

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

  const metaResult = await sendInstagramTextMessage({
    igUserId: credentials.igUserId,
    accessToken: credentials.accessToken,
    recipientIgId: customerIgId,
    message,
  })

  const now = new Date().toISOString()

  conversation = await chatRepository.upsertConversation({
    storeId: input.storeId,
    customerIgId,
    igUserId: credentials.igUserId,
    customerIgUsername: customerUsername,
    customerId: customer.id,
    lastMessageAt: now,
    lastMessagePreview: message,
  })

  const saved = await chatRepository.insertMessage({
    storeId: input.storeId,
    conversationId: conversation.id,
    metaMessageId: metaResult.metaMessageId,
    direction: 'outbound',
    fromIgId: credentials.igUserId,
    toIgId: customerIgId,
    type: 'text',
    textBody: message,
    status: 'sent',
    rawPayload: metaResult.raw,
    timestamp: now,
  })

  if (!saved) {
    throw new AppError(500, 'Failed to persist outbound message', 'INSTAGRAM_MESSAGE_SAVE_FAILED')
  }

  emitInstagramNewMessage(input.storeId, conversation.id, saved)
  emitInstagramConversationUpdated(input.storeId, conversation)

  await pauseInboxAiForConversation({
    channel: 'instagram',
    storeId: input.storeId,
    conversationId: conversation.id,
  })

  const refreshed = await chatRepository.findConversationById({
    storeId: input.storeId,
    conversationId: conversation.id,
  })
  if (refreshed) {
    emitInstagramConversationUpdated(input.storeId, refreshed)
  }

  return {
    conversation,
    message: saved,
    metaMessageId: metaResult.metaMessageId,
  }
}
