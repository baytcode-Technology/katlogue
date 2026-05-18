import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { Order, OrderItem, Payment } from '../types/order.types.js'

export type InsertOrderRow = {
  store_id: string
  customer_id: string
  conversation_id?: string | null
  order_number: string
  status: string
  source: string
  subtotal: number
  discount_amount: number
  shipping_fee: number
  tax_amount: number
  total: number
  shipping_address: Record<string, unknown>
  notes?: string | null
  confirmed_at?: string | null
}

export type InsertOrderItemRow = {
  order_id: string
  product_id: string
  variant_id?: string | null
  quantity: number
  unit_price: number
  snapshot: Record<string, unknown>
}

export async function insertOrder(row: InsertOrderRow): Promise<Order> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .insert({
      ...row,
      discount_amount: row.discount_amount,
      shipping_fee: row.shipping_fee,
      tax_amount: row.tax_amount,
    })
    .select()
    .single()

  if (error) {
    throw new AppError(400, error.message, 'ORDER_CREATE_FAILED')
  }

  return data as Order
}

export async function insertOrderItems(rows: InsertOrderItemRow[]): Promise<OrderItem[]> {
  const { data, error } = await supabaseAdmin.from('order_items').insert(rows).select()

  if (error) {
    throw new AppError(400, error.message, 'ORDER_ITEMS_CREATE_FAILED')
  }

  return (data ?? []) as OrderItem[]
}

export async function insertPayment(row: {
  order_id: string
  store_id: string
  provider: string
  amount: number
  currency: string
  status: string
}): Promise<Payment> {
  const { data, error } = await supabaseAdmin
    .from('payments')
    .insert(row)
    .select()
    .single()

  if (error) {
    throw new AppError(400, error.message, 'PAYMENT_CREATE_FAILED')
  }

  return data as Payment
}

export async function deleteOrder(orderId: string): Promise<void> {
  await supabaseAdmin.from('orders').delete().eq('id', orderId)
}
