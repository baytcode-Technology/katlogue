import { AppError } from '../../../shared/errors/app.error.js'
import * as chatRepository from '../repositories/whatsapp-chat.repository.js'
import { parseWhatsAppMessageContent } from './whatsapp-message-content.service.js'
import { sendWhatsAppMediaMessage } from './send-media-message.service.js'
import { sendWhatsAppTextMessage } from './send-text-message.service.js'

function resolveMediaIdFromMessage(message: {
  type: string
  media_id: string | null
  raw_payload: unknown
}): string | null {
  if (message.media_id?.trim()) return message.media_id.trim()
  const parsed = parseWhatsAppMessageContent(message.raw_payload)
  return parsed.mediaId
}

function mapForwardMediaType(type: string): 'image' | 'audio' | 'video' | null {
  if (type === 'image' || type === 'sticker') return 'image'
  if (type === 'video') return 'video'
  if (type === 'audio') return 'audio'
  return null
}

export async function forwardWhatsAppMessage(input: {
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
    throw new AppError(404, 'Source message not found', 'WHATSAPP_MESSAGE_NOT_FOUND')
  }

  const target = await chatRepository.findConversationById({
    storeId: input.storeId,
    conversationId: input.targetConversationId,
  })
  if (!target) {
    throw new AppError(404, 'Target conversation not found', 'WHATSAPP_CONVERSATION_NOT_FOUND')
  }

  if (source.type === 'reaction') {
    throw new AppError(400, 'Cannot forward reactions', 'WHATSAPP_FORWARD_UNSUPPORTED')
  }

  const mediaType = mapForwardMediaType(source.type)
  const mediaId = mediaType ? resolveMediaIdFromMessage(source) : null

  if (mediaType && mediaId) {
    return sendWhatsAppMediaMessage({
      storeId: input.storeId,
      ownerId: input.ownerId,
      to: target.customer_wa_number,
      conversationId: target.id,
      type: mediaType,
      mediaId,
      mimeType: source.mime_type,
      caption: source.caption,
      voice: source.type === 'audio',
    })
  }

  if (source.type === 'text' && source.text_body?.trim()) {
    return sendWhatsAppTextMessage({
      storeId: input.storeId,
      ownerId: input.ownerId,
      to: target.customer_wa_number,
      message: source.text_body.trim(),
      conversationId: target.id,
    })
  }

  throw new AppError(400, 'This message type cannot be forwarded yet', 'WHATSAPP_FORWARD_UNSUPPORTED')
}
