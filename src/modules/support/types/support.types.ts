export type SupportConversationStatus = 'active' | 'escalated' | 'closed';

export type SupportMessageRole = 'user' | 'assistant' | 'admin';

export type SupportConversation = {
  id: number;
  store_id: number;
  owner_id: string;
  status: SupportConversationStatus;
  last_message_at: string | null;
  expires_at: string;
  escalated_at: string | null;
  ticket_code: string | null;
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
};
