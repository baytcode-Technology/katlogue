import * as storeRepository from '../../stores/repositories/store.repository.js'
import { checkInboxAiPreviewRateLimit } from '../preview-rate-limit.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { InboxAiChannel } from './conversation-history.service.js'
import { composeInboxAiReply } from './compose-inbox-ai-reply.service.js'

export async function previewInboxAiReply(input: {
  storeId: number
  message: string
  channel: InboxAiChannel
}) {
  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  if (!checkInboxAiPreviewRateLimit(input.storeId)) {
    throw new AppError(
      429,
      'Preview limit reached. Try again in about an hour.',
      'INBOX_AI_PREVIEW_RATE_LIMIT'
    )
  }

  const composed = await composeInboxAiReply({
    store,
    channel: input.channel,
    customerText: input.message,
  })

  const { intent, reply, replyText, wouldSendImage, lastShownProduct } = composed

  return {
    intent: intent.intent,
    customerLanguage: intent.customerLanguage,
    scriptStyle: intent.scriptStyle,
    searchQuery: intent.searchQuery || null,
    color: intent.color,
    categoryName: intent.categoryName,
    requestedItem: intent.requestedItem,
    replyText,
    wouldSendImage,
    hasFollowUpText: Boolean(reply.followUpText?.trim()),
    lastShownProductTitle: lastShownProduct?.title ?? null,
    note: 'Preview only — not sent to any customer',
  }
}
