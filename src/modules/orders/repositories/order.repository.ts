import { supabaseAdmin } from '../../../config/supabase.js'

import { AppError } from '../../../shared/errors/app.error.js'
import { getCurrentMonthBounds } from '../../../shared/utils/order-month-bounds.js'
import {
  formatMonthlyOrderNumber,
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



export async function allocateOrderNumber(
  storeId: number,
  date: Date = new Date()
): Promise<string> {
  const { numberPrefix, start, end } = getCurrentMonthBounds(date)

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('order_number')
    .eq('store_id', storeId)
    .gte('created_at', start)
    .lt('created_at', end)
    .like('order_number', `${numberPrefix}-%`)

  if (error) {
    throw new AppError(400, error.message, 'ORDER_NUMBER_ALLOCATE_FAILED')
  }

  let maxSeq = 0
  for (const row of data ?? []) {
    const seq = parseMonthlyOrderSequence(String(row.order_number), numberPrefix)
    if (seq !== null && seq > maxSeq) maxSeq = seq
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
  payment_proof_url?: string | null
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

export type OrderWithDetails = Order & { items: OrderItem[]; payment: Payment | null }

async function attachOrderDetails(orders: Order[]): Promise<OrderWithDetails[]> {
  if (orders.length === 0) return []

  const orderIds = orders.map((order) => order.id)
  const items = await findOrderItemsByOrderIds(orderIds)
  const itemsByOrder = new Map<number, OrderItem[]>()
  for (const item of items) {
    const list = itemsByOrder.get(item.order_id) ?? []
    list.push(item)
    itemsByOrder.set(item.order_id, list)
  }

  const { data: paymentRows, error: paymentError } = await supabaseAdmin
    .from('payments')
    .select('*')
    .in('order_id', orderIds)
    .order('created_at', { ascending: false })

  if (paymentError) {
    throw new AppError(400, paymentError.message, 'PAYMENT_LOOKUP_FAILED')
  }

  const paymentByOrder = new Map<number, Payment>()
  for (const row of paymentRows ?? []) {
    const payment = row as Payment
    if (!paymentByOrder.has(payment.order_id)) {
      paymentByOrder.set(payment.order_id, payment)
    }
  }

  return orders.map((order) => ({
    ...order,
    items: itemsByOrder.get(order.id) ?? [],
    payment: paymentByOrder.get(order.id) ?? null,
  }))
}

function uniqueOrdersById(orders: OrderWithDetails[]): OrderWithDetails[] {
  const seen = new Set<number>()
  const result: OrderWithDetails[] = []
  for (const order of orders) {
    if (seen.has(order.id)) continue
    seen.add(order.id)
    result.push(order)
  }
  return result.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export async function findRecentOrdersForCustomers(
  storeId: number,
  customerIds: number[],
  limit = 8
): Promise<OrderWithDetails[]> {
  if (customerIds.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('store_id', storeId)
    .in('customer_id', customerIds)
    .neq('source', 'razorpay_setup_test')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new AppError(400, error.message, 'ORDER_LIST_FAILED')
  }

  return attachOrderDetails((data ?? []) as Order[])
}

export async function findRecentOrdersForCustomer(
  storeId: number,
  customerId: number,
  limit = 5
): Promise<OrderWithDetails[]> {
  return findRecentOrdersForCustomers(storeId, [customerId], limit)
}

export async function findOrderByNumberForCustomers(
  storeId: number,
  customerIds: number[],
  orderNumber: string
): Promise<OrderWithDetails | null> {
  if (customerIds.length === 0) return null

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('store_id', storeId)
    .in('customer_id', customerIds)
    .eq('order_number', orderNumber)
    .neq('source', 'razorpay_setup_test')
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'ORDER_LOOKUP_FAILED')
  }

  if (!data) return null

  const [withDetails] = await attachOrderDetails([data as Order])
  return withDetails ?? null
}

export async function findOrderByNumberForCustomer(
  storeId: number,
  customerId: number,
  orderNumber: string
): Promise<OrderWithDetails | null> {
  return findOrderByNumberForCustomers(storeId, [customerId], orderNumber)
}

export async function findOrdersByNumberSuffixForCustomers(
  storeId: number,
  customerIds: number[],
  suffix: string
): Promise<OrderWithDetails[]> {
  if (customerIds.length === 0) return []
  const clean = suffix.replace(/\D/g, '')
  if (!clean || clean.length > 6) return []

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('store_id', storeId)
    .in('customer_id', customerIds)
    .like('order_number', `%-${clean}`)
    .neq('source', 'razorpay_setup_test')
    .order('created_at', { ascending: false })
    .limit(8)

  if (error) {
    throw new AppError(400, error.message, 'ORDER_LOOKUP_FAILED')
  }

  return attachOrderDetails((data ?? []) as Order[])
}

export async function findRecentOrdersByShippingPhone(
  storeId: number,
  phoneVariants: string[],
  limit = 8
): Promise<OrderWithDetails[]> {
  const variants = [...new Set(phoneVariants.map((v) => v.trim()).filter(Boolean))]
  if (variants.length === 0) return []

  const filters = variants.flatMap((variant) => [
    `shipping_address->>whatsapp_number.eq.${variant}`,
    `shipping_address->>phone_number.eq.${variant}`,
  ])

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('store_id', storeId)
    .is('customer_id', null)
    .neq('source', 'razorpay_setup_test')
    .or(filters.join(','))
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new AppError(400, error.message, 'ORDER_LIST_FAILED')
  }

  return uniqueOrdersById(await attachOrderDetails((data ?? []) as Order[]))
}

export function mergeOrderDetails(groups: OrderWithDetails[][]): OrderWithDetails[] {
  return uniqueOrdersById(groups.flat())
}

