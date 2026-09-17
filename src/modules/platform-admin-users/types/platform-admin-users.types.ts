export type AdminHasStoreFilter = 'yes' | 'no'
export type AdminPlanFilter = 'free' | 'starter' | 'business' | 'enterprise'
export type AdminSignedAfterFilter = '7d' | '30d' | '90d'
export type AdminStorePlan = 'starter' | 'business' | 'enterprise'

export type ListPlatformAdminUsersQuery = {
  q?: string
  hasStore?: AdminHasStoreFilter
  plan?: AdminPlanFilter
  signedAfter?: AdminSignedAfterFilter
  sort?: 'recent'
  page: number
  limit: number
}

export type PlatformAdminUserCard = {
  id: string
  email: string | null
  phone: string | null
  created_at: string
  last_sign_in_at: string | null
  has_store: boolean
  store_count: number
  primary_store_name: string | null
  primary_store_phone: string | null
  rollup_plan: AdminStorePlan | null
  premium_active: boolean
}

export type PlatformAdminPaymentSummary = {
  store_id: number
  cod_enabled: boolean
  razorpay_enabled: boolean
  razorpay_configured: boolean
  razorpay_mode: 'test' | 'live'
  razorpay_key_id_masked: string | null
  upi_enabled: boolean
  upi_vpa_masked: string | null
}

export type PlatformAdminStoreSummary = {
  id: number
  name: string
  slug: string
  logo_url: string | null
  phone: string | null
  country: string
  currency: string
  timezone: string
  industry: string | null
  is_active: boolean
  created_at: string
  subscription_plan: AdminStorePlan
  subscription_expires_at: string | null
  premium_active: boolean
  product_count: number
  order_count: number
  ai_auto_reply_enabled: boolean
  ai_third_party_consent_at: string | null
  whatsapp_connected: boolean
  instagram_connected: boolean
  instagram_username: string | null
  storefront_url: string
  payments: PlatformAdminPaymentSummary
}

export type PlatformAdminCheckoutSummary = {
  id: number
  store_id: number
  plan: 'business' | 'enterprise'
  status: 'pending' | 'paid' | 'failed'
  amount: number
  currency: string
  paid_at: string | null
  period_expires_at: string | null
  created_at: string
}

export type PlatformAdminUserAccount = {
  id: string
  email: string | null
  phone: string | null
  created_at: string
  last_sign_in_at: string | null
  providers: string[]
}

export type PlatformAdminUserDetail = {
  user: PlatformAdminUserAccount
  stores: PlatformAdminStoreSummary[]
  subscriptions: PlatformAdminCheckoutSummary[]
}

export type ListPlatformAdminUsersResult = {
  users: PlatformAdminUserCard[]
  count: number
  page: number
  limit: number
  total: number
}
