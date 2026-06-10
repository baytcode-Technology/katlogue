export type Store = {
  id: string
  owner_id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  banner_url: string | null
  whatsapp_number: string
  wa_phone_number_id: string | null
  wa_waba_id: string | null
  wa_access_token: string | null
  ig_user_id: string | null
  ig_username: string | null
  ig_access_token: string | null
  currency: string
  timezone: string
  payment_config: Record<string, unknown>
  ai_system_prompt: string | null
  ai_language: string | null
  industry: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type MyStoreResult = {
  hasStore: boolean
  store: Store | null
}

export type CreateStoreInput = {
  name: string
  slug: string
  whatsapp_number: string
  currency: string
  description?: string | null
  logo_url?: string | null
  banner_url?: string | null
  timezone?: string | null
  ai_language?: string | null
  ai_system_prompt?: string | null
  industry?: string | null
}
