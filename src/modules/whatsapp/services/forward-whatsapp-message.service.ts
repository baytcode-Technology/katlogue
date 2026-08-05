import { AppError } from '../../../shared/errors/app.error.js'
import * as chatRepository from '../repositories/whatsapp-chat.repository.js'
import { parseWhatsAppMessageContent } from './whatsapp-message-content.service.js'
import { sendWhatsAppMediaMessage } from './send-media-message.service.js'
import { sendWhatsAppTextMessage } from './send-text-message.service.js'
import { downloadWhatsAppMedia } from './whatsapp-media.service.js'
import { uploadWhatsAppMediaToMeta } from './upload-whatsapp-media.service.js'

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

function isVoiceMessage(message: {
  type: string
  mime_type: string | null
  raw_payload: unknown
}): boolean {
  if (message.type !== 'audio') return false
  const parsed = parseWhatsAppMessageContent(message.raw_payload)
  if (message.mime_type?.toLowerCase().includes('ogg')) return true
  if (parsed.mimeType?.toLowerCase().includes('ogg')) return true
  const raw = message.raw_payload as { audio?: { voice?: boolean } } | null
  return raw?.audio?.voice === true
}

function filenameForForward(type: 'image' | 'audio' | 'video', mimeType: string): string {
  if (type === 'image') {
    if (mimeType.includes('png')) return `forward-${Date.now()}.png`
    if (mimeType.includes('webp')) return `forward-${Date.now()}.webp`
    return `forward-${Date.now()}.jpg`
  }
  if (type === 'video') {
    return mimeType.includes('3gp') ? `forward-${Date.now()}.3gp` : `forward-${Date.now()}.mp4`
  }
  if (mimeType.includes('ogg')) return `forward-${Date.now()}.ogg`
  if (mimeType.includes('amr')) return `forward-${Date.now()}.amr`
  return `forward-${Date.now()}.m4a`
}

async function resolveForwardMedia(input: {
  storeId: number
  ownerId: string
  source: NonNullable<Awaited<ReturnType<typeof chatRepository.findMessageById>>>
  mediaType: 'image' | 'audio' | 'video'
}): Promise<{ mediaId: string; mimeType: string | null; voice: boolean } | null> {
  const resolvedId = resolveMediaIdFromMessage(input.source)
  if (!resolvedId) return null

  const parsed = parseWhatsAppMessageContent(input.source.raw_payload)
  const voice = isVoiceMessage(input.source)

  if (input.source.media_id?.trim()) {
    return {
      mediaId: resolvedId,
      mimeType: input.source.mime_type ?? parsed.mimeType,
      voice,
    }
  }

  const { buffer, mimeType: downloadedMime } = await downloadWhatsAppMedia({
    storeId: input.storeId,
    mediaId: resolvedId,
  })

  const mimeType = input.source.mime_type ?? parsed.mimeType ?? downloadedMime
  const uploaded = await uploadWhatsAppMediaToMeta({
    storeId: input.storeId,
    ownerId: input.ownerId,
    kind: input.mediaType,
    buffer,
    mimeType,
    filename: filenameForForward(input.mediaType, mimeType),
    voice: input.mediaType === 'audio' ? voice : false,
  })

  return {
    mediaId: uploaded.mediaId,
    mimeType: uploaded.mimeType,
    voice,
  }
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
  if (mediaType) {
    const media = await resolveForwardMedia({
      storeId: input.storeId,
      ownerId: input.ownerId,
      source,
      mediaType,
    })

    if (media) {
      return sendWhatsAppMediaMessage({
        storeId: input.storeId,
        ownerId: input.ownerId,
        to: target.customer_wa_number,
        conversationId: target.id,
        type: mediaType,
        mediaId: media.mediaId,
        mimeType: media.mimeType,
        caption: source.caption,
        voice: media.voice,
      })
    }
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
