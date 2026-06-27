export type SupportConversationStatus = 'active' | 'escalated' | 'closed';

export type SupportReplyMode = 'ai' | 'manual';

export type SupportMessageRole = 'user' | 'assistant' | 'admin' | 'system';

export type SupportConversation = {
  id: number;
  store_id: number;
  owner_id: string;
  status: SupportConversationStatus;
  reply_mode: SupportReplyMode;
  last_message_at: string | null;
  expires_at: string;
  escalated_at: string | null;
  closed_at: string | null;
  ticket_code: string | null;
  merchant_last_read_at: string | null;
  admin_last_read_at: string | null;
  created_at: string;
};

export type SupportMessage = {
  id: number;
  conversation_id: number;
  role: SupportMessageRole;
  content: string;
  created_at: string;
};

export type SupportAdminConversation = SupportConversation & {
  store_name: string;
  owner_email: string | null;
  last_message_preview: string | null;
  unread_count?: number;
};

export type SupportMerchantUnreadSummary = {
  unread_count: number;
  conversation_id: number | null;
  last_preview: string | null;
};

export type SupportAdminSummary = {
  escalated_count: number;
  unread_messages: number;
  awaiting_manual_count: number;
};
