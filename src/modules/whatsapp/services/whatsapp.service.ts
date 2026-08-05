import axios from 'axios'
import { env } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'
import {
  verifyMetaWebhookSignature,
  verifyMetaWebhookSubscribe,
} from '../../../shared/utils/meta-webhook.js'
import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'
import type { Store } from '../../stores/types/store.types.js'
import { parseWhatsAppMessageContent } from './whatsapp-message-content.service.js'

export type WhatsAppCredentials = {
  accessToken: string
  phoneNumberId: string
  apiVersion: string
}

export type ParsedWebhookMessage = {
  metaMessageId: string
  from: string
  to: string | null
  type: string
  textBody: string | null
  mediaId: string | null
  mimeType: string | null
  caption: string | null
  reactionEmoji: string | null
  reactionTargetId: string | null
  timestamp: string | null
  raw: unknown
}

export type ParsedWebhookStatus = {
  metaMessageId: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string | null
  recipientId: string | null
  raw: unknown
}

export type ParsedWebhookChange = {
  waPhoneNumberId: string | null
  displayPhoneNumber: string | null
  messages: ParsedWebhookMessage[]
  statuses: ParsedWebhookStatus[]
}

export type SendTextMessageInput = {
  to: string
  message: string
  credentials: WhatsAppCredentials
}

export type SendTextMessageResult = {
  metaMessageId: string
  raw: unknown
}

export type SendTemplateMessageInput = {
  to: string
  templateName: string
  languageCode?: string
  credentials: WhatsAppCredentials
}

export type SendMediaMessageInput = {
  to: string
  credentials: WhatsAppCredentials
  type: 'image' | 'audio' | 'video'
  mediaId: string
  caption?: string | null
  voice?: boolean
}

type MetaErrorResponse = {
  error?: {
    message?: string
    code?: number
    error_subcode?: number
  }
}

type WebhookBody = {
  entry?: Array<{
    id?: string
    changes?: Array<{
      field?: string
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string }
        messages?: Array<{
          id?: string
          from?: string
          timestamp?: string
          type?: string
          text?: { body?: string }
        }>
        statuses?: Array<{
          id?: string
          status?: string
          timestamp?: string
          recipient_id?: string
        }>
      }
    }>
  }>
}

function metaErrorMessage(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback
  const data = err.response?.data as MetaErrorResponse | undefined
  return data?.error?.message?.trim() || fallback
}

function graphUrl(credentials: WhatsAppCredentials, path: string): string {
  return `https://graph.facebook.com/${credentials.apiVersion}/${credentials.phoneNumberId}${path}`
}

function authHeaders(credentials: WhatsAppCredentials) {
  return {
    Authorization: `Bearer ${credentials.accessToken}`,
    'Content-Type': 'application/json',
  }
}

function parseTimestamp(value: string | undefined): string | null {
  if (!value || !/^\d+$/.test(value)) return null
  return new Date(Number(value) * 1000).toISOString()
}

function normalizeStatus(value: string | undefined): ParsedWebhookStatus['status'] | null {
  const status = value?.trim().toLowerCase()
  if (status === 'sent' || status === 'delivered' || status === 'read' || status === 'failed') {
    return status
  }
  return null
}

/** Resolve per-store credentials; global env fallback only in non-production. */
export function resolveStoreWhatsAppCredentials(store: Store): WhatsAppCredentials | null {
  const storeToken = store.wa_access_token?.trim()
  const storePhoneId = store.wa_phone_number_id?.trim()

  if (storeToken && storePhoneId) {
    return {
      accessToken: storeToken,
      phoneNumberId: storePhoneId,
      apiVersion: env.WHATSAPP.API_VERSION,
    }
  }

  if (env.NODE_ENV === 'production') {
    return null
  }

  const accessToken = env.WHATSAPP.ACCESS_TOKEN
  const phoneNumberId = env.WHATSAPP.PHONE_NUMBER_ID
  if (!accessToken || !phoneNumberId) return null

  return {
    accessToken,
    phoneNumberId,
    apiVersion: env.WHATSAPP.API_VERSION,
  }
}

export function isWhatsAppReadyForStore(store: Store): boolean {
  return resolveStoreWhatsAppCredentials(store) !== null
}

/** Meta GET /webhook verification. */
export function verifyWebhook(input: {
  mode: string
  token: string
  challenge: string
  verifyToken: string | undefined
}): string {
  return verifyMetaWebhookSubscribe({
    ...input,
    notConfiguredMessage: 'WhatsApp webhook is not configured on this server',
  })
}

/** Verify Meta x-hub-signature-256 when app secret is configured. */
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): void {
  verifyMetaWebhookSignature(rawBody, signatureHeader, env.WHATSAPP.APP_SECRET)
}

/** Parse Meta webhook payload into normalized changes. */
export function parseWebhookPayload(body: unknown): ParsedWebhookChange[] {
  const payload = body as WebhookBody
  const results: ParsedWebhookChange[] = []

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue

      const waPhoneNumberId = value.metadata?.phone_number_id?.trim() ?? null
      const displayPhoneNumber = value.metadata?.display_phone_number
        ? normalizeWhatsAppNumber(value.metadata.display_phone_number)
        : null

      const messages: ParsedWebhookMessage[] = []
      for (const msg of value.messages ?? []) {
        const metaMessageId = msg.id?.trim()
        const from = msg.from ? normalizeWhatsAppNumber(msg.from) : null
        const type = msg.type?.trim() || 'unknown'
        const content = parseWhatsAppMessageContent(msg)
        if (!metaMessageId || !from) continue

        messages.push({
          metaMessageId,
          from,
          to: displayPhoneNumber,
          type: content.type,
          textBody: content.textBody,
          mediaId: content.mediaId,
          mimeType: content.mimeType,
          caption: content.caption,
          reactionEmoji: content.reactionEmoji,
          reactionTargetId: content.reactionTargetId,
          timestamp: parseTimestamp(msg.timestamp),
          raw: msg,
        })
      }

      const statuses: ParsedWebhookStatus[] = []
      for (const status of value.statuses ?? []) {
        const metaMessageId = status.id?.trim()
        const normalized = normalizeStatus(status.status)
        if (!metaMessageId || !normalized) continue

        statuses.push({
          metaMessageId,
          status: normalized,
          timestamp: parseTimestamp(status.timestamp),
          recipientId: status.recipient_id
            ? normalizeWhatsAppNumber(status.recipient_id)
            : null,
          raw: status,
        })
      }

      if (messages.length > 0 || statuses.length > 0) {
        results.push({ waPhoneNumberId, displayPhoneNumber, messages, statuses })
      }
    }
  }

  return results
}

/** Build a stable idempotency key for webhook events. */
export function buildWebhookEventKey(change: ParsedWebhookChange): string | null {
  const messageIds = change.messages.map((m) => m.metaMessageId)
  const statusIds = change.statuses.map((s) => `${s.metaMessageId}:${s.status}`)
  const parts = [...messageIds, ...statusIds]
  if (parts.length === 0) return null
  return parts.sort().join('|')
}

export async function sendTextMessage(
  input: SendTextMessageInput
): Promise<SendTextMessageResult> {
  const to = normalizeWhatsAppNumber(input.to)
  const message = input.message.trim()
  if (!message) {
    throw new AppError(400, 'Message cannot be empty', 'MESSAGE_EMPTY')
  }

  try {
    const { data } = await axios.post<{ messages?: Array<{ id?: string }> }>(
      graphUrl(input.credentials, '/messages'),
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: message },
      },
      { headers: authHeaders(input.credentials), timeout: 15_000 }
    )

    const metaMessageId = data.messages?.[0]?.id?.trim()
    if (!metaMessageId) {
      throw new AppError(502, 'Meta did not return a message id', 'WHATSAPP_NO_MESSAGE_ID')
    }

    return { metaMessageId, raw: data }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(400, metaErrorMessage(err, 'Failed to send WhatsApp message'), 'WHATSAPP_SEND_FAILED')
  }
}

export async function sendMediaMessage(
  input: SendMediaMessageInput
): Promise<SendTextMessageResult> {
  const to = normalizeWhatsAppNumber(input.to)
  const mediaId = input.mediaId.trim()
  if (!mediaId) {
    throw new AppError(400, 'mediaId is required', 'WHATSAPP_MEDIA_ID_REQUIRED')
  }

  let payload: Record<string, unknown>
  if (input.type === 'image') {
    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: {
        id: mediaId,
        ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
      },
    }
  } else if (input.type === 'video') {
    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'video',
      video: {
        id: mediaId,
        ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
      },
    }
  } else {
    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'audio',
      audio: { id: mediaId, voice: input.voice ?? false },
    }
  }

  try {
    const { data } = await axios.post<{ messages?: Array<{ id?: string }> }>(
      graphUrl(input.credentials, '/messages'),
      payload,
      { headers: authHeaders(input.credentials), timeout: 60_000 }
    )

    const metaMessageId = data.messages?.[0]?.id?.trim()
    if (!metaMessageId) {
      throw new AppError(502, 'Meta did not return a message id', 'WHATSAPP_NO_MESSAGE_ID')
    }

    return { metaMessageId, raw: data }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(400, metaErrorMessage(err, 'Failed to send WhatsApp media'), 'WHATSAPP_SEND_FAILED')
  }
}

export async function sendTemplateMessage(
  input: SendTemplateMessageInput
): Promise<SendTextMessageResult> {
  const to = normalizeWhatsAppNumber(input.to)
  const templateName = input.templateName.trim()
  const languageCode = (input.languageCode?.trim() || 'en_US').trim()

  try {
    const { data } = await axios.post<{ messages?: Array<{ id?: string }> }>(
      graphUrl(input.credentials, '/messages'),
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
        },
      },
      { headers: authHeaders(input.credentials), timeout: 15_000 }
    )

    const metaMessageId = data.messages?.[0]?.id?.trim()
    if (!metaMessageId) {
      throw new AppError(502, 'Meta did not return a message id', 'WHATSAPP_NO_MESSAGE_ID')
    }

    return { metaMessageId, raw: data }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(
      400,
      metaErrorMessage(err, 'Failed to send WhatsApp template'),
      'WHATSAPP_TEMPLATE_SEND_FAILED'
    )
  }
}

/** Mark an inbound message as read (shows blue ticks to customer). */
export async function markAsRead(input: {
  metaMessageId: string
  credentials: WhatsAppCredentials
}): Promise<void> {
  try {
    await axios.post(
      graphUrl(input.credentials, '/messages'),
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: input.metaMessageId,
      },
      { headers: authHeaders(input.credentials), timeout: 10_000 }
    )
  } catch (err) {
    throw new AppError(
      400,
      metaErrorMessage(err, 'Failed to mark message as read'),
      'WHATSAPP_MARK_READ_FAILED'
    )
  }
}
