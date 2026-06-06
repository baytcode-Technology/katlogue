import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { Order, OrderItem, Payment, UpdateOrderInput } from '../types/order.types.js'

export type InsertOrderRow = {
  store_id: string
  customer_id: string | null
  conversation_id?: string | null
  order_number: string
  order_status: string
  payment_status: string
  fulfillment_status: string
  source: string
  subtotal: number
  discount_amount: number
  shipping_fee: number
  tax_amount: number
  total: number
  shipping_address: Record<string, unknown>
  notes?: string | null
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

export type OrderWithCustomer = Order & {
  customers: { name: string | null; whatsapp_number: string } | null
}

export async function findOrdersByStoreId(storeId: string): Promise<OrderWithCustomer[]> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*, customers(name, whatsapp_number)')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new AppError(400, error.message, 'ORDER_LIST_FAILED')
  }

  return (data ?? []) as OrderWithCustomer[]
}

export async function findOrderById(orderId: string): Promise<OrderWithCustomer | null> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*, customers(name, whatsapp_number)')
    .eq('id', orderId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'ORDER_LOOKUP_FAILED')
  }

  return (data as OrderWithCustomer | null) ?? null
}

export async function updateOrder(orderId: string, patch: UpdateOrderInput): Promise<Order> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.order_status !== undefined) row.order_status = patch.order_status
  if (patch.payment_status !== undefined) row.payment_status = patch.payment_status
  if (patch.fulfillment_status !== undefined) row.fulfillment_status = patch.fulfillment_status

  const { data, error } = await supabaseAdmin
    .from('orders')
    .update(row)
    .eq('id', orderId)
    .select()
    .single()

  if (error) {
    throw new AppError(400, error.message, 'ORDER_UPDATE_FAILED')
  }

  return data as Order
}

export async function findOrderItemsByOrderIds(orderIds: string[]): Promise<OrderItem[]> {
  if (orderIds.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('order_items')
    .select('*')
    .in('order_id', orderIds)

  if (error) {
    throw new AppError(400, error.message, 'ORDER_ITEMS_LOOKUP_FAILED')
  }

  return (data ?? []) as OrderItem[]
}
