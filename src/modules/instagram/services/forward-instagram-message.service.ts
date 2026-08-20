import { AppError } from '../../../shared/errors/app.error.js'
import * as chatRepository from '../repositories/instagram-chat.repository.js'
import { sendInstagramMediaMessageService } from './send-instagram-media.service.js'
import { sendInstagramTextMessageService } from './send-instagram-message.service.js'

function mapForwardMediaType(type: string): 'image' | 'audio' | 'video' | null {
  if (type === 'image' || type === 'sticker') return 'image'
  if (type === 'video') return 'video'
  if (type === 'audio') return 'audio'
  return null
}

export async function forwardInstagramMessage(input: {
  storeId: number
  ownerId: string
  sourceMessageId: number
  targetConversationId: number
}) {
  const source = await chatRepository.findMessageById({
    storeId: input.storeId,
    messageId: input.sourceMessageId,
  })
  if (!source) {
    throw new AppError(404, 'Source message not found', 'INSTAGRAM_MESSAGE_NOT_FOUND')
  }

  const target = await chatRepository.findConversationById({
    storeId: input.storeId,
    conversationId: input.targetConversationId,
  })
  if (!target) {
    throw new AppError(404, 'Target conversation not found', 'INSTAGRAM_CONVERSATION_NOT_FOUND')
  }

  const mediaType = mapForwardMediaType(source.type)
  const mediaUrl = source.media_url?.trim() || null

  if (mediaType && mediaUrl) {
    return sendInstagramMediaMessageService({
      storeId: input.storeId,
      ownerId: input.ownerId,
      to: target.customer_ig_id,
      type: mediaType,
      mediaUrl,
      mimeType: source.mime_type,
      caption: source.caption ?? (source.type === 'text' ? null : source.text_body),
      conversationId: target.id,
    })
  }

  const text = source.text_body?.trim() || source.caption?.trim()
  if (!text) {
    throw new AppError(400, 'Cannot forward this message type', 'INSTAGRAM_FORWARD_UNSUPPORTED')
  }

  return sendInstagramTextMessageService({
    storeId: input.storeId,
    ownerId: input.ownerId,
    to: target.customer_ig_id,
    message: text,
    conversationId: target.id,
  })
}
