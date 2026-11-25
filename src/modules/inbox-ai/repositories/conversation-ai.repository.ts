import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { PendingCheckout } from '../pending-checkout.js'

export type InboxChannel = 'whatsapp' | 'instagram'

const PAUSE_MINUTES = 60

function tableForChannel(channel: InboxChannel): string {
  return channel === 'whatsapp' ? 'whatsapp_conversations' : 'instagram_conversations'
}

export async function updateConversationReplyMode(input: {
  channel: InboxChannel
  storeId: number
  conversationId: number
  replyMode: 'ai' | 'manual'
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from(tableForChannel(input.channel))
    .update({
      reply_mode: input.replyMode,
      ai_paused_until: input.replyMode === 'ai' ? null : new Date().toISOString(),
      ...(input.replyMode === 'ai'
        ? { staff_warned_at: null, staff_waiting_at: null }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', input.storeId)
    .eq('id', input.conversationId)

  if (error) {
    throw new AppError(400, error.message, 'CONVERSATION_REPLY_MODE_UPDATE_FAILED')
  }
}

export async function pauseInboxAiForConversation(input: {
  channel: InboxChannel
  storeId: number
  conversationId: number
}): Promise<void> {
  const until = new Date(Date.now() + PAUSE_MINUTES * 60 * 1000).toISOString()
  const { error } = await supabaseAdmin
    .from(tableForChannel(input.channel))
    .update({
      ai_paused_until: until,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', input.storeId)
    .eq('id', input.conversationId)

  if (error) {
    throw new AppError(400, error.message, 'CONVERSATION_AI_PAUSE_FAILED')
  }
}

export async function clearAiPauseForConversation(input: {
  channel: InboxChannel
  storeId: number
  conversationId: number
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from(tableForChannel(input.channel))
    .update({
      ai_paused_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', input.storeId)
    .eq('id', input.conversationId)

  if (error) {
    throw new AppError(400, error.message, 'CONVERSATION_AI_PAUSE_CLEAR_FAILED')
  }
}

export function isAiPaused(aiPausedUntil: string | null | undefined): boolean {
  if (!aiPausedUntil) return false
  return new Date(aiPausedUntil).getTime() > Date.now()
}

export async function tryMarkAiDisclosureSent(input: {
  channel: InboxChannel
  storeId: number
  conversationId: number
}): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from(tableForChannel(input.channel))
    .update({
      ai_disclosure_sent: true,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', input.storeId)
    .eq('id', input.conversationId)
    .eq('ai_disclosure_sent', false)
    .select('id')
    .maybeSingle()

  if (error) {
    throw new AppError(
      400,
      error.message,
      'CONVERSATION_AI_DISCLOSURE_SENT_UPDATE_FAILED'
    )
  }

  return Boolean(data)
}

export async function markStaffWarned(input: {
  channel: InboxChannel
  storeId: number
  conversationId: number
}): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from(tableForChannel(input.channel))
    .update({
      staff_warned_at: now,
      updated_at: now,
    })
    .eq('store_id', input.storeId)
    .eq('id', input.conversationId)
    .is('staff_warned_at', null)

  if (error) {
    throw new AppError(400, error.message, 'CONVERSATION_STAFF_WARN_FAILED')
  }
}

export async function saveWhatsAppPendingCheckout(input: {
  storeId: number
  conversationId: number
  checkout: PendingCheckout
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .update({
      pending_checkout: input.checkout,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', input.storeId)
    .eq('id', input.conversationId)

  if (error) {
    throw new AppError(400, error.message, 'WHATSAPP_CHECKOUT_SAVE_FAILED')
  }
}

export async function clearWhatsAppPendingCheckout(input: {
  storeId: number
  conversationId: number
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .update({
      pending_checkout: null,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', input.storeId)
    .eq('id', input.conversationId)

  if (error) {
    throw new AppError(400, error.message, 'WHATSAPP_CHECKOUT_CLEAR_FAILED')
  }
}

/** Moves awaiting_proof to creating. A second photo updates zero rows. */
export async function claimWhatsAppPendingCheckout(input: {
  storeId: number
  conversationId: number
  checkout: PendingCheckout
}): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .update({
      pending_checkout: input.checkout,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', input.storeId)
    .eq('id', input.conversationId)
    .filter('pending_checkout->>status', 'eq', 'awaiting_proof')
    .select('id')
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'WHATSAPP_CHECKOUT_CLAIM_FAILED')
  }

  return Boolean(data)
}

export async function markStaffWaiting(input: {
  channel: InboxChannel
  storeId: number
  conversationId: number
}): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from(tableForChannel(input.channel))
    .update({
      reply_mode: 'manual',
      staff_waiting_at: now,
      updated_at: now,
    })
    .eq('store_id', input.storeId)
    .eq('id', input.conversationId)

  if (error) {
    throw new AppError(400, error.message, 'CONVERSATION_STAFF_WAITING_FAILED')
  }
}
