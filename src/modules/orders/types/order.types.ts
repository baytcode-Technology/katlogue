export type OrderStatus =
  | 'draft'
  | 'pending_payment'
  | 'paid'
  | 'confirmed'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

import type { OptionalShippingAddress } from '../../../shared/validations/shipping-address.validation.js'

export type PaymentMethod = 'razorpay' | 'cod'

export type OrderItemInput = {
  product_id: string
  quantity: number
  variant_id?: string
}

export type CreateOrderInput = {
  customer_id?: string
  whatsapp_number?: string
  name?: string
  email?: string
  items: OrderItemInput[]
  payment_method: PaymentMethod
  shipping_address?: OptionalShippingAddress
  notes?: string
  conversation_id?: string
  /** e.g. storefront, whatsapp, offline */
  source?: string
}

export type Order = {
  id: string
  store_id: string
  customer_id: string | null
  conversation_id: string | null
  order_number: string
  status: OrderStatus
  source: string
  subtotal: number
  discount_amount: number
  shipping_fee: number
  tax_amount: number
  total: number
  coupon_id: string | null
  coupon_code: string | null
  shipping_address: OptionalShippingAddress & Record<string, unknown>
  shipping_method: string | null
  tracking_number: string | null
  notes: string | null
  admin_notes: string | null
  paid_at: string | null
  confirmed_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export type OrderItem = {
  id: string
  order_id: string
  product_id: string
  variant_id: string | null
  quantity: number
  unit_price: number
  total_price: number
  snapshot: Record<string, unknown>
}

export type Payment = {
  id: string
  order_id: string
  store_id: string
  provider: string
  provider_order_id: string | null
  provider_payment_id: string | null
  amount: number
  currency: string
  status: string
  paid_at: string | null
  created_at: string
}

export type CreateOrderResult = {
  order: Order
  items: OrderItem[]
  payment: Payment
  customer_id: string | null
  payment_method: PaymentMethod
  razorpay?: {
    pending: true
    message: string
  }
}
