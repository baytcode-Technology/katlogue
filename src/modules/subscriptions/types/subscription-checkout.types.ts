export type SubscriptionCheckoutStatus = 'pending' | 'paid' | 'failed'

export type SubscriptionCheckout = {
  id: number
  store_id: number
  owner_id: string
  provider: string
  provider_order_id: string
  provider_payment_id: string | null
  amount: number
  currency: string
  plan: 'business' | 'enterprise'
  status: SubscriptionCheckoutStatus
  paid_at: string | null
  period_expires_at: string | null
  created_at: string
}

export type InsertSubscriptionCheckoutRow = {
  store_id: number
  owner_id: string
  provider_order_id: string
  amount: number
  currency: string
  plan?: 'business' | 'enterprise'
}
