import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'
import type { Customer, UpsertCustomerInput } from '../types/customer.types.js'

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
      return updated as Customer
    }

    await supabaseAdmin
      .from('customers')
      .update({ last_seen_at: updates.last_seen_at })
      .eq('id', existing.id)

    return existing as Customer
  }

  const { data: created, error: insertError } = await supabaseAdmin
    .from('customers')
    .insert({
      store_id: storeId,
      whatsapp_number: normalized,
      name: profile.name ?? null,
      email: profile.email ?? null,
      address: profile.address ?? {},
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (insertError) {
    throw new AppError(400, insertError.message, 'CUSTOMER_CREATE_FAILED')
  }

  return created as Customer
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
      return updated as Customer
    }

    await supabaseAdmin
      .from('customers')
      .update({ last_seen_at: updates.last_seen_at })
      .eq('id', existing.id)

    return existing as Customer
  }

  const displayName = profile.name ?? profile.username ?? null
  const { data: created, error: insertError } = await supabaseAdmin
    .from('customers')
    .insert({
      store_id: storeId,
      whatsapp_number: placeholder,
      name: displayName,
      address: {},
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (insertError) {
    throw new AppError(400, insertError.message, 'CUSTOMER_CREATE_FAILED')
  }

  return created as Customer
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

  return (data ?? []) as Customer[]
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

  return data as Customer | null
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
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    throw new AppError(400, error.message, 'CUSTOMER_CREATE_FAILED')
  }

  return data as Customer
}
