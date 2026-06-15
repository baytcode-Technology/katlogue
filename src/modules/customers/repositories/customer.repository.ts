import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'
import type { StorefrontShippingAddress } from '../../../shared/validations/shipping-address.validation.js'
import {
  mergeShippingAddressIfNew,
  parseSavedShippingAddresses,
  toSavedShippingAddress,
} from '../lib/shipping-addresses.js'
import type { Customer, UpsertCustomerInput } from '../types/customer.types.js'

function mapCustomerRow(row: Record<string, unknown>): Customer {
  return {
    ...(row as Customer),
    shipping_addresses: parseSavedShippingAddresses(row.shipping_addresses),
    order_ids: Array.isArray(row.order_ids) ? (row.order_ids as string[]) : [],
  }
}

export async function findCustomerByPhone(
  storeId: string,
  phone: string
): Promise<Customer | null> {
  const normalized = normalizeWhatsAppNumber(phone)

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('store_id', storeId)
    .eq('whatsapp_number', normalized)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'CUSTOMER_LOOKUP_FAILED')
  }

  return data ? mapCustomerRow(data as Record<string, unknown>) : null
}

export async function resolveStorefrontCustomer(input: {
  storeId: string
  phone: string
  shippingAddress: StorefrontShippingAddress
  email?: string
  name?: string
}): Promise<Customer> {
  const normalizedPhone = normalizeWhatsAppNumber(input.phone)
  const savedAddress = toSavedShippingAddress(input.shippingAddress, normalizedPhone)
  const displayName = input.name?.trim() || input.shippingAddress.name.trim()

  const existing = await findCustomerByPhone(input.storeId, normalizedPhone)

  if (existing) {
    const shipping_addresses = mergeShippingAddressIfNew(
      existing.shipping_addresses,
      savedAddress
    )
    const updates: Record<string, unknown> = {
      last_seen_at: new Date().toISOString(),
      shipping_addresses,
    }
    if (displayName) updates.name = displayName
    if (input.email !== undefined) updates.email = input.email

    const { data, error } = await supabaseAdmin
      .from('customers')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      throw new AppError(400, error.message, 'CUSTOMER_UPDATE_FAILED')
    }

    return mapCustomerRow(data as Record<string, unknown>)
  }

  const { data, error } = await supabaseAdmin
    .from('customers')
    .insert({
      store_id: input.storeId,
      whatsapp_number: normalizedPhone,
      name: displayName,
      email: input.email ?? null,
      address: {},
      shipping_addresses: [savedAddress],
      order_ids: [],
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    throw new AppError(400, error.message, 'CUSTOMER_CREATE_FAILED')
  }

  return mapCustomerRow(data as Record<string, unknown>)
}

export async function appendOrderToCustomer(
  customerId: string,
  storeId: string,
  orderId: string,
  orderTotal: number
): Promise<void> {
  const customer = await findCustomerById(customerId, storeId)
  if (!customer) {
    throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND')
  }

  const order_ids = customer.order_ids.includes(orderId)
    ? customer.order_ids
    : [...customer.order_ids, orderId]

  const { error } = await supabaseAdmin
    .from('customers')
    .update({
      order_ids,
      total_orders: customer.total_orders + 1,
      total_spent: Number(customer.total_spent) + Number(orderTotal),
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', customerId)
    .eq('store_id', storeId)

  if (error) {
    throw new AppError(400, error.message, 'CUSTOMER_UPDATE_FAILED')
  }
}

export async function findOrCreateByWhatsApp(
  storeId: string,
  whatsappNumber: string,
  profile: UpsertCustomerInput = {}
): Promise<Customer> {
  const normalized = normalizeWhatsAppNumber(whatsappNumber)

  const { data: existing, error: findError } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('store_id', storeId)
    .eq('whatsapp_number', normalized)
    .maybeSingle()

  if (findError) {
    throw new AppError(400, findError.message, 'CUSTOMER_LOOKUP_FAILED')
  }

  if (existing) {
    const updates: Record<string, unknown> = {
      last_seen_at: new Date().toISOString(),
    }
    if (profile.name !== undefined) updates.name = profile.name
    if (profile.email !== undefined) updates.email = profile.email
    if (profile.address !== undefined) updates.address = profile.address

    if (Object.keys(updates).length > 1) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('customers')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .single()

      if (updateError) {
        throw new AppError(400, updateError.message, 'CUSTOMER_UPDATE_FAILED')
      }
      return mapCustomerRow(updated as Record<string, unknown>)
    }

    await supabaseAdmin
      .from('customers')
      .update({ last_seen_at: updates.last_seen_at })
      .eq('id', existing.id)

    return mapCustomerRow(existing as Record<string, unknown>)
  }

  const { data: created, error: insertError } = await supabaseAdmin
    .from('customers')
    .insert({
      store_id: storeId,
      whatsapp_number: normalized,
      name: profile.name ?? null,
      email: profile.email ?? null,
      address: profile.address ?? {},
      shipping_addresses: [],
      order_ids: [],
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (insertError) {
    throw new AppError(400, insertError.message, 'CUSTOMER_CREATE_FAILED')
  }

  return mapCustomerRow(created as Record<string, unknown>)
}

export async function findOrCreateByInstagram(
  storeId: string,
  igUserId: string,
  profile: { username?: string | null; name?: string | null } = {}
): Promise<Customer> {
  const placeholder = `ig:${igUserId.trim()}`

  const { data: existing, error: findError } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('store_id', storeId)
    .eq('whatsapp_number', placeholder)
    .maybeSingle()

  if (findError) {
    throw new AppError(400, findError.message, 'CUSTOMER_LOOKUP_FAILED')
  }

  if (existing) {
    const updates: Record<string, unknown> = {
      last_seen_at: new Date().toISOString(),
    }
    if (profile.name !== undefined) updates.name = profile.name
    if (profile.username !== undefined && profile.username) {
      updates.name = profile.name ?? profile.username
    }

    if (Object.keys(updates).length > 1) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('customers')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .single()

      if (updateError) {
        throw new AppError(400, updateError.message, 'CUSTOMER_UPDATE_FAILED')
      }
      return mapCustomerRow(updated as Record<string, unknown>)
    }

    await supabaseAdmin
      .from('customers')
      .update({ last_seen_at: updates.last_seen_at })
      .eq('id', existing.id)

    return mapCustomerRow(existing as Record<string, unknown>)
  }

  const displayName = profile.name ?? profile.username ?? null
  const { data: created, error: insertError } = await supabaseAdmin
    .from('customers')
    .insert({
      store_id: storeId,
      whatsapp_number: placeholder,
      name: displayName,
      address: {},
      shipping_addresses: [],
      order_ids: [],
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (insertError) {
    throw new AppError(400, insertError.message, 'CUSTOMER_CREATE_FAILED')
  }

  return mapCustomerRow(created as Record<string, unknown>)
}

export async function findCustomersByStoreId(storeId: string): Promise<Customer[]> {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('store_id', storeId)
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw new AppError(400, error.message, 'CUSTOMER_LIST_FAILED')
  }

  return (data ?? []).map((row) => mapCustomerRow(row as Record<string, unknown>))
}

export async function findCustomerById(
  customerId: string,
  storeId: string
): Promise<Customer | null> {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'CUSTOMER_LOOKUP_FAILED')
  }

  return data ? mapCustomerRow(data as Record<string, unknown>) : null
}

export async function findOrderSummariesForCustomer(
  storeId: string,
  orderIds: string[]
): Promise<Array<{ id: string; order_number: string; total: number; created_at: string }>> {
  if (orderIds.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, total, created_at')
    .eq('store_id', storeId)
    .in('id', orderIds)
    .order('created_at', { ascending: false })

  if (error) {
    throw new AppError(400, error.message, 'ORDER_LOOKUP_FAILED')
  }

  return (data ?? []) as Array<{
    id: string
    order_number: string
    total: number
    created_at: string
  }>
}

export async function insertCustomer(input: {
  store_id: string
  whatsapp_number: string
  name?: string | null
  email?: string | null
}): Promise<Customer> {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .insert({
      store_id: input.store_id,
      whatsapp_number: input.whatsapp_number,
      name: input.name ?? null,
      email: input.email ?? null,
      address: {},
      shipping_addresses: [],
      order_ids: [],
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    throw new AppError(400, error.message, 'CUSTOMER_CREATE_FAILED')
  }

  return mapCustomerRow(data as Record<string, unknown>)
}
