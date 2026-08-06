import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'

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

export function isAiPaused(aiPausedUntil: string | null | undefined): boolean {
  if (!aiPausedUntil) return false
  return new Date(aiPausedUntil).getTime() > Date.now()
}
