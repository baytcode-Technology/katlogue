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
