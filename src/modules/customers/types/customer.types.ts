export type Customer = {
  id: string
  store_id: string
  whatsapp_number: string
  name: string | null
  email: string | null
  address: Record<string, unknown>
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
