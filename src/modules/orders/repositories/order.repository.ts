import { supabaseAdmin } from '../../../config/supabase.js'

import { AppError } from '../../../shared/errors/app.error.js'
import {
  formatMonthlyOrderNumber,
  getCurrentMonthBounds,
  parseMonthlyOrderSequence,
} from '../../../shared/utils/generate-order-number.js'
import type { Order, OrderItem, Payment, UpdateOrderInput } from '../types/order.types.js'



export type InsertOrderRow = {
  store_id: number
  customer_id: number | null
  conversation_id?: number | null
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
  checkout_token?: string | null
}



export type InsertOrderItemRow = {

  order_id: number

  product_id: number

  variant_id?: number | null

  quantity: number

  unit_price: number

  snapshot: Record<string, unknown>

}



/** Next order number for this store in the current UTC month, e.g. FEB26-1, FEB27-1. */
export async function allocateOrderNumber(storeId: number): Promise<string> {
  const { numberPrefix, start, end } = getCurrentMonthBounds()

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('order_number')
    .eq('store_id', storeId)
    .gte('created_at', start)
    .lt('created_at', end)
    .ilike('order_number', `${numberPrefix}-%`)

  if (error) {
    throw new AppError(400, error.message, 'ORDER_NUMBER_ALLOC_FAILED')
  }

  let maxSeq = 0
  for (const row of data ?? []) {
    const seq = parseMonthlyOrderSequence(row.order_number)
    if (seq > maxSeq) maxSeq = seq
  }

  return formatMonthlyOrderNumber(numberPrefix, maxSeq + 1)
}

export async function countOrdersInCurrentMonth(storeId: number): Promise<number> {
  const { start, end } = getCurrentMonthBounds()

  const { count, error } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .gte('created_at', start)
    .lt('created_at', end)

  if (error) {
    throw new AppError(400, error.message, 'ORDER_COUNT_FAILED')
  }

  return count ?? 0
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
  order_id: number
  store_id: number
  provider: string
  amount: number
  currency: string
  status: string
  provider_order_id?: string | null
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



export async function deleteOrder(orderId: number): Promise<void> {

  await supabaseAdmin.from('orders').delete().eq('id', orderId)

}



export type OrderWithCustomer = Order & {

  customers: { name: string | null; whatsapp_number: string } | null

}



export async function findOrdersByStoreId(storeId: number): Promise<OrderWithCustomer[]> {

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



export async function findOrderById(orderId: number): Promise<OrderWithCustomer | null> {

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

export async function markOrderViewedByMerchant(
  orderId: number,
  storeId: number
): Promise<OrderWithCustomer> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({
      merchant_viewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('store_id', storeId)
    .select('*, customers(name, whatsapp_number)')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'ORDER_VIEWED_UPDATE_FAILED')
  }

  return data as OrderWithCustomer
}



export async function updateOrder(orderId: number, patch: UpdateOrderInput): Promise<Order> {

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



export async function findOrderItemsByOrderIds(orderIds: number[]): Promise<OrderItem[]> {

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

export async function findPaymentByOrderId(orderId: number): Promise<Payment | null> {
  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'PAYMENT_LOOKUP_FAILED')
  }

  return (data as Payment | null) ?? null
}

export async function findPaymentByProviderOrderId(
  providerOrderId: string
): Promise<Payment | null> {
  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('provider_order_id', providerOrderId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'PAYMENT_LOOKUP_FAILED')
  }

  return (data as Payment | null) ?? null
}

export async function updatePayment(
  paymentId: number,
  patch: Partial<{
    status: string
    provider_order_id: string | null
    provider_payment_id: string | null
    paid_at: string | null
  }>
): Promise<Payment> {
  const row: Record<string, unknown> = {}
  if (patch.status !== undefined) row.status = patch.status
  if (patch.provider_order_id !== undefined) row.provider_order_id = patch.provider_order_id
  if (patch.provider_payment_id !== undefined) row.provider_payment_id = patch.provider_payment_id
  if (patch.paid_at !== undefined) row.paid_at = patch.paid_at

  const { data, error } = await supabaseAdmin
    .from('payments')
    .update(row)
    .eq('id', paymentId)
    .select()
    .single()

  if (error) {
    throw new AppError(400, error.message, 'PAYMENT_UPDATE_FAILED')
  }

  return data as Payment
}

export async function findOrderByIdAndCheckoutToken(
  orderId: number,
  checkoutToken: string
): Promise<Order | null> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('checkout_token', checkoutToken)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'ORDER_LOOKUP_FAILED')
  }

  return (data as Order | null) ?? null
}

