import { supabaseAdmin } from '../../../config/supabase.js';
import { AppError } from '../../../shared/errors/app.error.js';
import type {
  SupportAdminConversation,
  SupportConversation,
  SupportMessage,
  SupportMessageRole,
  SupportReplyMode,
} from '../types/support.types.js';

const SUPPORT_TTL_HOURS = 48;

function mapConversation(row: Record<string, unknown>): SupportConversation {
  return row as unknown as SupportConversation;
}

function mapMessage(row: Record<string, unknown>): SupportMessage {
  return row as unknown as SupportMessage;
}

export function supportExpiresAt(): string {
  const d = new Date();
  d.setHours(d.getHours() + SUPPORT_TTL_HOURS);
  return d.toISOString();
}

export async function findActiveConversation(
  storeId: number
): Promise<SupportConversation | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('support_conversations')
    .select('*')
    .eq('store_id', storeId)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError(400, error.message, 'SUPPORT_CONVERSATION_LOOKUP_FAILED');
  }

  return data ? mapConversation(data) : null;
}

export async function insertConversation(
  storeId: number,
  ownerId: string
): Promise<SupportConversation> {
  const expiresAt = supportExpiresAt();
  const { data, error } = await supabaseAdmin
    .from('support_conversations')
    .insert({
      store_id: storeId,
      owner_id: ownerId,
      status: 'active',
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error || !data) {
    throw new AppError(400, error?.message ?? 'Failed to create conversation', 'SUPPORT_CREATE_FAILED');
  }

  return mapConversation(data);
}

export async function getConversationById(
  conversationId: number
): Promise<SupportConversation | null> {
  const { data, error } = await supabaseAdmin
    .from('support_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) {
    throw new AppError(400, error.message, 'SUPPORT_CONVERSATION_LOOKUP_FAILED');
  }

  return data ? mapConversation(data) : null;
}

export async function listMessages(conversationId: number): Promise<SupportMessage[]> {
  const { data, error } = await supabaseAdmin
    .from('support_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new AppError(400, error.message, 'SUPPORT_MESSAGES_LOOKUP_FAILED');
  }

  return (data ?? []).map(mapMessage);
}

export async function insertMessage(
  conversationId: number,
  role: SupportMessageRole,
  content: string
): Promise<SupportMessage> {
  const { data, error } = await supabaseAdmin
    .from('support_messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
    })
    .select()
    .single();

  if (error || !data) {
    throw new AppError(400, error?.message ?? 'Failed to save message', 'SUPPORT_MESSAGE_CREATE_FAILED');
  }

  await supabaseAdmin
    .from('support_conversations')
    .update({ last_message_at: data.created_at })
    .eq('id', conversationId);

  return mapMessage(data);
}

export async function escalateConversation(
  conversationId: number
): Promise<SupportConversation> {
  const existing = await getConversationById(conversationId);
  if (!existing) {
    throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  }

  if (existing.status === 'escalated' && existing.ticket_code) {
    return existing;
  }

  const ticketCode = generateTicketCode();
  const { data, error } = await supabaseAdmin
    .from('support_conversations')
    .update({
      status: 'escalated',
      escalated_at: new Date().toISOString(),
      ticket_code: existing.ticket_code ?? ticketCode,
      reply_mode: 'ai',
      closed_at: null,
    })
    .eq('id', conversationId)
    .select()
    .single();

  if (error || !data) {
    throw new AppError(400, error?.message ?? 'Failed to escalate', 'SUPPORT_ESCALATE_FAILED');
  }

  return mapConversation(data);
}

export async function setReplyMode(
  conversationId: number,
  replyMode: SupportReplyMode
): Promise<SupportConversation> {
  const existing = await getConversationById(conversationId);
  if (!existing) {
    throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  }

  if (existing.status !== 'escalated') {
    throw new AppError(
      400,
      'Reply mode can only be changed on open tickets',
      'INVALID_CONVERSATION_STATUS'
    );
  }

  const { data, error } = await supabaseAdmin
    .from('support_conversations')
    .update({ reply_mode: replyMode })
    .eq('id', conversationId)
    .select()
    .single();

  if (error || !data) {
    throw new AppError(400, error?.message ?? 'Failed to update reply mode', 'SUPPORT_REPLY_MODE_FAILED');
  }

  return mapConversation(data);
}

export async function closeConversation(
  conversationId: number
): Promise<SupportConversation> {
  const existing = await getConversationById(conversationId);
  if (!existing) {
    throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  }

  if (existing.status !== 'escalated') {
    throw new AppError(
      400,
      'Only open tickets can be closed',
      'INVALID_CONVERSATION_STATUS'
    );
  }

  const { data, error } = await supabaseAdmin
    .from('support_conversations')
    .update({
      status: 'closed',
      reply_mode: 'ai',
      closed_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .select()
    .single();

  if (error || !data) {
    throw new AppError(400, error?.message ?? 'Failed to close ticket', 'SUPPORT_CLOSE_FAILED');
  }

  return mapConversation(data);
}

function generateTicketCode(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `KT-${date}-${rand}`;
}

export async function listAdminConversations(): Promise<SupportAdminConversation[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('support_conversations')
    .select(
      `
      *,
      stores!inner(name)
    `
    )
    .gt('expires_at', now)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) {
    throw new AppError(400, error.message, 'SUPPORT_ADMIN_LIST_FAILED');
  }

  const rows = data ?? [];
  const ownerIds = [...new Set(rows.map((r) => r.owner_id as string))];
  const emailByOwner = new Map<string, string | null>();

  for (const ownerId of ownerIds) {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(ownerId);
    emailByOwner.set(ownerId, userData.user?.email ?? null);
  }

  const previews = await Promise.all(
    rows.map(async (row) => {
      const { data: lastMsg } = await supabaseAdmin
        .from('support_messages')
        .select('content')
        .eq('conversation_id', row.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        id: row.id as number,
        preview: (lastMsg?.content as string | undefined) ?? null,
      };
    })
  );

  const previewMap = new Map(previews.map((p) => [p.id, p.preview]));

  return rows.map((row) => {
    const stores = row.stores as { name: string } | { name: string }[] | null;
    const storeName = Array.isArray(stores) ? stores[0]?.name : stores?.name;
    return {
      ...(mapConversation(row)),
      store_name: storeName ?? 'Unknown store',
      owner_email: emailByOwner.get(row.owner_id as string) ?? null,
      last_message_preview: previewMap.get(row.id as number) ?? null,
    };
  }).sort((a, b) => {
    const statusOrder = (status: string) => {
      if (status === 'escalated') return 0;
      if (status === 'active') return 1;
      return 2;
    };
    const orderDiff = statusOrder(a.status) - statusOrder(b.status);
    if (orderDiff !== 0) return orderDiff;
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });
}

export async function deleteExpiredConversations(): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('support_conversations')
    .delete()
    .lt('expires_at', now)
    .select('id');

  if (error) {
    throw new AppError(400, error.message, 'SUPPORT_CLEANUP_FAILED');
  }

  return data?.length ?? 0;
}

export async function countProductsForStore(storeId: number): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId);

  if (error) return 0;
  return count ?? 0;
}
