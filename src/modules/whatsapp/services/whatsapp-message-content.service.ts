export type ParsedWhatsAppMessageContent = {
  type: string
  textBody: string | null
  mediaId: string | null
  mimeType: string | null
  caption: string | null
  reactionEmoji: string | null
  reactionTargetId: string | null
}

type RawWhatsAppMessage = {
  type?: string
  text?: { body?: string }
  image?: { id?: string; mime_type?: string; caption?: string }
  video?: { id?: string; mime_type?: string; caption?: string }
  audio?: { id?: string; mime_type?: string; voice?: boolean }
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string }
  sticker?: { id?: string; mime_type?: string }
  reaction?: { message_id?: string; emoji?: string }
  location?: { latitude?: number; longitude?: number; name?: string; address?: string }
  contacts?: Array<{ name?: { formatted_name?: string; first_name?: string } }>
  interactive?: {
    type?: string
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string; description?: string }
  }
  button?: { text?: string; payload?: string }
}

function trim(value: string | undefined | null): string | null {
  const v = value?.trim()
  return v || null
}

/** Normalize Meta webhook message object into display + media fields. */
export function parseWhatsAppMessageContent(raw: unknown): ParsedWhatsAppMessageContent {
  const msg = raw as RawWhatsAppMessage
  const type = msg.type?.trim() || 'unknown'

  switch (type) {
    case 'text': {
      const body = trim(msg.text?.body)
      return {
        type,
        textBody: body,
        mediaId: null,
        mimeType: null,
        caption: null,
        reactionEmoji: null,
        reactionTargetId: null,
      }
    }
    case 'image': {
      const caption = trim(msg.image?.caption)
      return {
        type,
        textBody: caption || 'Photo',
        mediaId: trim(msg.image?.id),
        mimeType: trim(msg.image?.mime_type),
        caption,
        reactionEmoji: null,
        reactionTargetId: null,
      }
    }
    case 'video': {
      const caption = trim(msg.video?.caption)
      return {
        type,
        textBody: caption || 'Video',
        mediaId: trim(msg.video?.id),
        mimeType: trim(msg.video?.mime_type),
        caption,
        reactionEmoji: null,
        reactionTargetId: null,
      }
    }
    case 'audio': {
      return {
        type,
        textBody: msg.audio?.voice ? 'Voice message' : 'Audio',
        mediaId: trim(msg.audio?.id),
        mimeType: trim(msg.audio?.mime_type),
        caption: null,
        reactionEmoji: null,
        reactionTargetId: null,
      }
    }
    case 'document': {
      const caption = trim(msg.document?.caption)
      const filename = trim(msg.document?.filename)
      return {
        type,
        textBody: caption || filename || 'Document',
        mediaId: trim(msg.document?.id),
        mimeType: trim(msg.document?.mime_type),
        caption: caption || filename,
        reactionEmoji: null,
        reactionTargetId: null,
      }
    }
    case 'sticker': {
      return {
        type,
        textBody: 'Sticker',
        mediaId: trim(msg.sticker?.id),
        mimeType: trim(msg.sticker?.mime_type) || 'image/webp',
        caption: null,
        reactionEmoji: null,
        reactionTargetId: null,
      }
    }
    case 'reaction': {
      const emoji = trim(msg.reaction?.emoji) || '👍'
      return {
        type,
        textBody: `Reacted ${emoji}`,
        mediaId: null,
        mimeType: null,
        caption: null,
        reactionEmoji: emoji,
        reactionTargetId: trim(msg.reaction?.message_id),
      }
    }
    case 'location': {
      const name = trim(msg.location?.name) || trim(msg.location?.address)
      return {
        type,
        textBody: name || 'Location',
        mediaId: null,
        mimeType: null,
        caption: null,
        reactionEmoji: null,
        reactionTargetId: null,
      }
    }
    case 'contacts': {
      const first = msg.contacts?.[0]?.name
      const contactName =
        trim(first?.formatted_name) || trim(first?.first_name) || 'Contact'
      return {
        type,
        textBody: `Contact: ${contactName}`,
        mediaId: null,
        mimeType: null,
        caption: null,
        reactionEmoji: null,
        reactionTargetId: null,
      }
    }
    case 'interactive': {
      const reply =
        trim(msg.interactive?.button_reply?.title) ||
        trim(msg.interactive?.list_reply?.title) ||
        trim(msg.interactive?.button_reply?.id) ||
        trim(msg.interactive?.list_reply?.id) ||
        'Reply'
      return {
        type,
        textBody: reply,
        mediaId: null,
        mimeType: null,
        caption: null,
        reactionEmoji: null,
        reactionTargetId: null,
      }
    }
    case 'button': {
      const label = trim(msg.button?.text) || trim(msg.button?.payload) || 'Reply'
      return {
        type,
        textBody: label,
        mediaId: null,
        mimeType: null,
        caption: null,
        reactionEmoji: null,
        reactionTargetId: null,
      }
    }
    default:
      return {
        type,
        textBody: 'Unsupported message',
        mediaId: null,
        mimeType: null,
        caption: null,
        reactionEmoji: null,
        reactionTargetId: null,
      }
  }
}

/** Preview line for conversation list and notifications. */
export function formatWhatsAppMessagePreview(input: {
  type: string
  textBody: string | null
}): string {
  if (input.textBody?.trim()) return input.textBody.trim()
  return `[${input.type}]`
}
