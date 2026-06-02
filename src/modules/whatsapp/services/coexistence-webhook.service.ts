import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'
import type { ParsedWebhookMessage } from './whatsapp.service.js'

export type ParsedContactSync = {
  phone: string
  name: string | null
  raw: unknown
}

export type WebhookFieldEvent = {
  field: string
  waPhoneNumberId: string | null
  displayPhoneNumber: string | null
  messages: ParsedWebhookMessage[]
  statuses: Array<{
    metaMessageId: string
    status: 'sent' | 'delivered' | 'read' | 'failed'
    timestamp: string | null
    recipientId: string | null
    raw: unknown
  }>
  contacts: ParsedContactSync[]
  historyMessages: ParsedWebhookMessage[]
  historyDeclined: boolean
  messageEchoes: ParsedWebhookMessage[]
  raw: unknown
}

type RawWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      field?: string
      value?: Record<string, unknown>
    }>
  }>
}

function parseTimestamp(value: string | undefined): string | null {
  if (!value || !/^\d+$/.test(value)) return null
  return new Date(Number(value) * 1000).toISOString()
}

function parseMessageList(
  items: unknown[],
  displayPhoneNumber: string | null,
  defaultDirection: 'inbound' | 'outbound'
): ParsedWebhookMessage[] {
  const results: ParsedWebhookMessage[] = []

  for (const item of items) {
    const msg = item as {
      id?: string
      from?: string
      to?: string
      timestamp?: string
      type?: string
      text?: { body?: string }
    }

    const metaMessageId = msg.id?.trim()
    if (!metaMessageId) continue

    const from = msg.from ? normalizeWhatsAppNumber(msg.from) : null
    const to = msg.to
      ? normalizeWhatsAppNumber(msg.to)
      : displayPhoneNumber

    if (!from && defaultDirection === 'inbound') continue

    const type = msg.type?.trim() || 'unknown'
    const textBody = type === 'text' ? (msg.text?.body?.trim() ?? null) : null

    results.push({
      metaMessageId,
      from: from ?? (defaultDirection === 'outbound' ? displayPhoneNumber ?? '' : ''),
      to,
      type,
      textBody,
      timestamp: parseTimestamp(msg.timestamp),
      raw: msg,
    })
  }

  return results
}

function parseContacts(value: Record<string, unknown>): ParsedContactSync[] {
  const results: ParsedContactSync[] = []
  const stateSync = value.state_sync as unknown[] | undefined

  for (const entry of stateSync ?? []) {
    const row = entry as {
      type?: string
      contact?: { full_name?: string; phone_number?: string; first_name?: string }
    }
    if (row.type !== 'contact' || !row.contact?.phone_number) continue

    results.push({
      phone: normalizeWhatsAppNumber(row.contact.phone_number),
      name: row.contact.full_name?.trim() || row.contact.first_name?.trim() || null,
      raw: row,
    })
  }

  return results
}

function parseHistory(value: Record<string, unknown>): {
  messages: ParsedWebhookMessage[]
  declined: boolean
} {
  const historyBlocks = value.history as unknown[] | undefined
  let declined = false
  const messages: ParsedWebhookMessage[] = []

  const metadata = value.metadata as { phone_number_id?: string; display_phone_number?: string } | undefined
  const displayPhoneNumber = metadata?.display_phone_number
    ? normalizeWhatsAppNumber(metadata.display_phone_number)
    : null

  for (const block of historyBlocks ?? []) {
    const b = block as {
      errors?: Array<{ code?: number }>
      threads?: Array<{ messages?: unknown[] }>
      messages?: unknown[]
    }

    if (b.errors?.some((e) => e.code === 2593109)) {
      declined = true
      continue
    }

    const threadMessages = b.threads?.flatMap((t) => t.messages ?? []) ?? b.messages ?? []
    messages.push(...parseMessageList(threadMessages, displayPhoneNumber, 'inbound'))
  }

  // Some payloads put messages directly under value
  const directMessages = value.messages as unknown[] | undefined
  if (directMessages?.length) {
    messages.push(...parseMessageList(directMessages, displayPhoneNumber, 'inbound'))
  }

  return { messages, declined }
}

/** Parse all webhook field types including coexistence. */
export function parseWebhookFieldEvents(body: unknown): WebhookFieldEvent[] {
  const payload = body as RawWebhookBody
  const results: WebhookFieldEvent[] = []

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const field = change.field?.trim() || 'unknown'
      const value = (change.value ?? {}) as Record<string, unknown>

      const metadata = value.metadata as
        | { phone_number_id?: string; display_phone_number?: string }
        | undefined

      const waPhoneNumberId = metadata?.phone_number_id?.trim() ?? null
      const displayPhoneNumber = metadata?.display_phone_number
        ? normalizeWhatsAppNumber(metadata.display_phone_number)
        : null

      const event: WebhookFieldEvent = {
        field,
        waPhoneNumberId,
        displayPhoneNumber,
        messages: [],
        statuses: [],
        contacts: [],
        historyMessages: [],
        historyDeclined: false,
        messageEchoes: [],
        raw: value,
      }

      if (field === 'messages') {
        event.messages = parseMessageList(
          (value.messages as unknown[]) ?? [],
          displayPhoneNumber,
          'inbound'
        )
      } else if (field === 'smb_message_echoes' || field === 'message_echoes') {
        event.messageEchoes = parseMessageList(
          (value.message_echoes as unknown[]) ?? (value.messages as unknown[]) ?? [],
          displayPhoneNumber,
          'outbound'
        )
      } else if (field === 'smb_app_state_sync') {
        event.contacts = parseContacts(value)
      } else if (field === 'history') {
        const history = parseHistory(value)
        event.historyMessages = history.messages
        event.historyDeclined = history.declined
      } else if (field === 'statuses' || field === 'message_status') {
        for (const s of (value.statuses as unknown[]) ?? []) {
          const status = s as {
            id?: string
            status?: string
            timestamp?: string
            recipient_id?: string
          }
          const metaMessageId = status.id?.trim()
          const normalized = status.status?.trim().toLowerCase()
          if (
            !metaMessageId ||
            !['sent', 'delivered', 'read', 'failed'].includes(normalized ?? '')
          ) {
            continue
          }
          event.statuses.push({
            metaMessageId,
            status: normalized as 'sent' | 'delivered' | 'read' | 'failed',
            timestamp: parseTimestamp(status.timestamp),
            recipientId: status.recipient_id
              ? normalizeWhatsAppNumber(status.recipient_id)
              : null,
            raw: status,
          })
        }
      } else {
        // Fallback: try parsing messages/statuses from unknown fields
        if (Array.isArray(value.messages)) {
          event.messages = parseMessageList(value.messages, displayPhoneNumber, 'inbound')
        }
      }

      const hasData =
        event.messages.length > 0 ||
        event.statuses.length > 0 ||
        event.contacts.length > 0 ||
        event.historyMessages.length > 0 ||
        event.historyDeclined ||
        event.messageEchoes.length > 0

      if (hasData || ['account_update'].includes(field)) {
        results.push(event)
      }
    }
  }

  return results
}

export function buildFieldEventKey(event: WebhookFieldEvent): string | null {
  const parts: string[] = [event.field]

  for (const m of event.messages) parts.push(`m:${m.metaMessageId}`)
  for (const m of event.messageEchoes) parts.push(`e:${m.metaMessageId}`)
  for (const m of event.historyMessages) parts.push(`h:${m.metaMessageId}`)
  for (const s of event.statuses) parts.push(`s:${s.metaMessageId}:${s.status}`)
  for (const c of event.contacts) parts.push(`c:${c.phone}`)

  if (event.historyDeclined) parts.push('history:declined')

  if (parts.length <= 1) return null
  return parts.sort().join('|')
}
