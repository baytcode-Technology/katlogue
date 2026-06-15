export type SavedShippingAddress = {
  id: string
  name: string
  phone_number: string
  address: string
  city: string
  district: string
  state: string
  postcode: string
  created_at: string
}

export type Customer = {
  id: string
  store_id: string
  whatsapp_number: string
  name: string | null
  email: string | null
  /** @deprecated Use shipping_addresses */
  address: Record<string, unknown>
  shipping_addresses: SavedShippingAddress[]
  order_ids: string[]
  tags: string[]
  notes: string | null
  total_orders: number
  total_spent: number
  last_seen_at: string | null
  created_at: string
}

export type UpsertCustomerInput = {
  name?: string
  email?: string
  address?: Record<string, unknown>
}

export type StorefrontCustomerOrderSummary = {
  id: string
  order_number: string
  total: number
  created_at: string
}

export type PublicCustomerByPhone = {
  id: string
  name: string | null
  phone_number: string
  shipping_addresses: SavedShippingAddress[]
  orders: StorefrontCustomerOrderSummary[]
}
