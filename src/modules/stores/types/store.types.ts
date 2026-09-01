export type ThemeTemplate = 'classic' | 'boutique' | 'modern'
export type ProductCardStyle = 'classic' | 'minimal' | 'bold'

/** Storefront theme customization. null / missing → default (current) look. */
export type ThemeConfig = {
  template?: ThemeTemplate
  colors?: {
    /** Hex color, e.g. #2DB84C */
    primary?: string
    background?: string
    text?: string
  }
  productCard?: ProductCardStyle
}

export type Store = {
  id: number
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
  country: string
  timezone: string
  payment_config: Record<string, unknown>
  notification_preferences: Record<string, unknown>
  theme_config: ThemeConfig | null
  ai_system_prompt: string | null
  ai_language: string | null
  ai_auto_reply_enabled: boolean
  ai_third_party_consent_at: string | null
  industry: string | null
  is_active: boolean
  subscription_plan: 'starter' | 'business' | 'enterprise'
  subscription_expires_at: string | null
  product_count: number
  order_count: number
  created_at: string
  updated_at: string
}

export type MyStoreResult = {
  hasStore: boolean
  store: Store | null
  role: 'owner' | 'staff' | null
}

/** Partial PATCH — only defined keys are updated. */
export type UpdateStoreInput = {
  name?: string
  slug?: string
  description?: string | null
  logo_url?: string | null
  banner_url?: string | null
  whatsapp_number?: string
  currency?: string
  country?: string
  timezone?: string
  industry?: string | null
  ai_system_prompt?: string | null
  ai_language?: string | null
  ai_auto_reply_enabled?: boolean
  ai_third_party_consent_at?: string | null
  is_active?: boolean
  theme_config?: ThemeConfig | null
}

export type CreateStoreInput = {
  name: string
  slug: string
  whatsapp_number: string
  currency: string
  country: string
  description?: string | null
  logo_url?: string | null
  banner_url?: string | null
  timezone?: string | null
  ai_language?: string | null
  ai_system_prompt?: string | null
  industry?: string | null
}
