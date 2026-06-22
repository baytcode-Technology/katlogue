export type OrderLifecycleStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled'



export type OrderPaymentStatus =
  | 'pending'
  | 'confirming'
  | 'paid'
  | 'refunded'

export type OrderFulfillmentStatus =
  | 'unfulfilled'
  | 'ready'
  | 'fulfilled'



import type { OptionalShippingAddress } from '../../../shared/validations/shipping-address.validation.js'



export type PaymentMethod = 'razorpay' | 'cod' | 'upi'



export type OrderItemInput = {

  product_id: number

  quantity: number

  variant_id?: number

}



export type CreateOrderInput = {

  customer_id?: number

  whatsapp_number?: string

  name?: string

  email?: string

  items: OrderItemInput[]

  payment_method: PaymentMethod

  payment_proof_url?: string | null

  shipping_address?: OptionalShippingAddress

  notes?: string

  conversation_id?: number

  /** e.g. storefront, whatsapp, offline */

  source?: string

  /** When true, insufficient stock does not block the order; inventory may go negative. */

  offline?: boolean

}



export type Order = {

  id: number

  store_id: number

  customer_id: number | null

  conversation_id: number | null

  order_number: string

  order_status: OrderLifecycleStatus

  payment_status: OrderPaymentStatus

  fulfillment_status: OrderFulfillmentStatus

  source: string

  subtotal: number

  discount_amount: number

  shipping_fee: number

  tax_amount: number

  total: number

  coupon_id: number | null

  coupon_code: string | null

  shipping_address: OptionalShippingAddress & Record<string, unknown>

  shipping_method: string | null

  tracking_number: string | null

  notes: string | null

  admin_notes: string | null

  checkout_token: string | null

  merchant_viewed_at: string | null

  created_at: string

  updated_at: string

}



export type OrderItem = {

  id: number

  order_id: number

  product_id: number

  variant_id: number | null

  quantity: number

  unit_price: number

  total_price: number

  snapshot: Record<string, unknown>

}



export type Payment = {

  id: number

  order_id: number

  store_id: number

  provider: string

  provider_order_id: number | null

  provider_payment_id: string | null

  payment_proof_url: string | null

  amount: number

  currency: string

  status: string

  paid_at: string | null

  created_at: string

}



export type UpdateOrderInput = Partial<{

  order_status: OrderLifecycleStatus

  payment_status: OrderPaymentStatus

  fulfillment_status: OrderFulfillmentStatus

}>



export type CreateOrderResult = {

  order: Order

  items: OrderItem[]

  payment: Payment

  customer_id: number | null

  payment_method: PaymentMethod

  checkout_token?: string | null

  razorpay?: {
    key_id: string
    order_id: string
    amount: number
    currency: string
  }

  upi?: {
    vpa: string
    qr_image_url: string | null
    display_name: string | null
    amount: number
    currency: string
    reference: string
  }

}


