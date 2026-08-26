import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { StoredPaymentConfig } from '../../payments/types/payment-config.types.js'
import type { StoredNotificationPreferences } from '../../notifications/types/notification.types.js'
import type { CreateStoreInput, Store, UpdateStoreInput } from '../types/store.types.js'

export async function assertStoreOwner(
  storeId: number,
  ownerId: string
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('owner_id', ownerId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'STORE_LOOKUP_FAILED')
  }

  if (!data) {
    throw new AppError(403, 'You do not have access to this store', 'FORBIDDEN')
  }
}

export { assertStoreMember } from './store-staff.repository.js'

function mapUniqueViolation(error: { code?: string; message?: string }): never {
  const message = error.message ?? ''
  if (message.includes('slug')) {
    throw new AppError(409, 'A store with this slug already exists', 'SLUG_EXISTS')
  }
  if (message.includes('whatsapp_number')) {
    throw new AppError(409, 'This WhatsApp number is already registered', 'WHATSAPP_EXISTS')
  }
  throw new AppError(409, 'Store already exists', 'CONFLICT')
}

export async function insertStore(
  ownerId: string,
  input: CreateStoreInput
): Promise<Store> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .insert({
      owner_id: ownerId,
      name: input.name,
      slug: input.slug,
      whatsapp_number: input.whatsapp_number,
      currency: input.currency,
      country: input.country,
      description: input.description ?? null,
      logo_url: input.logo_url ?? null,
      banner_url: input.banner_url ?? null,
      timezone: input.timezone ?? 'Asia/Kolkata',
      ai_language: input.ai_language ?? null,
      ai_system_prompt: input.ai_system_prompt ?? null,
      industry: input.industry ?? null,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      mapUniqueViolation(error)
    }
    throw new AppError(400, error.message, 'STORE_CREATE_FAILED')
  }

  return data as Store
}

export async function updateStore(storeId: number, patch: UpdateStoreInput): Promise<Store> {
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (patch.name !== undefined) row.name = patch.name
  if (patch.slug !== undefined) row.slug = patch.slug
  if (patch.description !== undefined) row.description = patch.description
  if (patch.logo_url !== undefined) row.logo_url = patch.logo_url
  if (patch.banner_url !== undefined) row.banner_url = patch.banner_url
  if (patch.whatsapp_number !== undefined) row.whatsapp_number = patch.whatsapp_number
  if (patch.currency !== undefined) row.currency = patch.currency
  if (patch.country !== undefined) row.country = patch.country
  if (patch.timezone !== undefined) row.timezone = patch.timezone
  if (patch.industry !== undefined) row.industry = patch.industry
  if (patch.ai_system_prompt !== undefined) row.ai_system_prompt = patch.ai_system_prompt
  if (patch.ai_language !== undefined) row.ai_language = patch.ai_language
  if (patch.ai_auto_reply_enabled !== undefined) row.ai_auto_reply_enabled = patch.ai_auto_reply_enabled
  if (patch.is_active !== undefined) row.is_active = patch.is_active
  if (patch.theme_config !== undefined) row.theme_config = patch.theme_config

  const { data, error } = await supabaseAdmin
    .from('stores')
    .update(row)
    .eq('id', storeId)
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      mapUniqueViolation(error)
    }
    throw new AppError(400, error.message, 'STORE_UPDATE_FAILED')
  }

  return data as Store
}

export async function findStoreByOwnerId(ownerId: string): Promise<Store | null> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'STORE_LOOKUP_FAILED')
  }

  return data as Store | null
}

export async function findStoreById(storeId: number): Promise<Store | null> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('*')
    .eq('id', storeId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'STORE_LOOKUP_FAILED')
  }

  return data as Store | null
}

export async function updateWhatsAppConnection(input: {
  storeId: number
  waPhoneNumberId: string | null
  waWabaId: string | null
  waAccessToken: string | null
  whatsappNumber?: string | null
}): Promise<Store> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .update({
      wa_phone_number_id: input.waPhoneNumberId,
      wa_waba_id: input.waWabaId,
      wa_access_token: input.waAccessToken,
      ...(input.whatsappNumber !== undefined ? { whatsapp_number: input.whatsappNumber } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.storeId)
    .select('*')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'STORE_UPDATE_FAILED')
  }

  return data as Store
}

export async function updateInstagramConnection(input: {
  storeId: number
  igUserId: string | null
  igUsername: string | null
  igAccessToken: string | null
}): Promise<Store> {
  if (input.igUserId) {
    const { error: disconnectError } = await supabaseAdmin
      .from('stores')
      .update({
        ig_user_id: null,
        ig_username: null,
        ig_access_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('ig_user_id', input.igUserId)
      .neq('id', input.storeId)

    if (disconnectError) {
      throw new AppError(400, disconnectError.message, 'STORE_UPDATE_FAILED')
    }
  }

  const { data, error } = await supabaseAdmin
    .from('stores')
    .update({
      ig_user_id: input.igUserId,
      ig_username: input.igUsername,
      ig_access_token: input.igAccessToken,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.storeId)
    .select('*')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'STORE_UPDATE_FAILED')
  }

  return data as Store
}

export async function findStoreByInstagramUserId(igUserId: string): Promise<Store | null> {
  const normalized = igUserId.trim()
  if (!normalized) return null

  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('*')
    .eq('ig_user_id', normalized)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'STORE_LOOKUP_FAILED')
  }

  return (data as Store) ?? null
}

export async function findStoreByWhatsAppWebhookTarget(input: {
  waPhoneNumberId?: string | null
  displayPhoneNumber?: string | null
}): Promise<Store | null> {
  const waPhoneNumberId = input.waPhoneNumberId?.trim()
  const displayPhoneNumber = input.displayPhoneNumber?.trim()

  if (waPhoneNumberId) {
    const { data: mapped, error: mapError } = await supabaseAdmin
      .from('whatsapp_store_numbers')
      .select('store_id')
      .eq('wa_phone_number_id', waPhoneNumberId)
      .maybeSingle()

    if (mapError) {
      throw new AppError(400, mapError.message, 'STORE_LOOKUP_FAILED')
    }

    if (mapped?.store_id) {
      const store = await findStoreById(mapped.store_id)
      if (store) return store
    }

    const { data, error } = await supabaseAdmin
      .from('stores')
      .select('*')
      .eq('wa_phone_number_id', waPhoneNumberId)
      .maybeSingle()

    if (error) {
      throw new AppError(400, error.message, 'STORE_LOOKUP_FAILED')
    }

    if (data) return data as Store
  }

  if (displayPhoneNumber) {
    const { data, error } = await supabaseAdmin
      .from('stores')
      .select('*')
      .eq('whatsapp_number', displayPhoneNumber)
      .maybeSingle()

    if (error) {
      throw new AppError(400, error.message, 'STORE_LOOKUP_FAILED')
    }

    if (data) return data as Store
  }

  return null
}

export async function updatePaymentConfig(
  storeId: number,
  paymentConfig: StoredPaymentConfig
): Promise<Store> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .update({
      payment_config: paymentConfig,
      updated_at: new Date().toISOString(),
    })
    .eq('id', storeId)
    .select('*')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'PAYMENT_CONFIG_UPDATE_FAILED')
  }

  return data as Store
}

export async function updateNotificationPreferences(
  storeId: number,
  preferences: StoredNotificationPreferences
): Promise<Store> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .update({
      notification_preferences: preferences,
      updated_at: new Date().toISOString(),
    })
    .eq('id', storeId)
    .select('*')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'NOTIFICATION_PREFERENCES_UPDATE_FAILED')
  }

  return data as Store
}

export async function findActiveStoreBySlug(slug: string): Promise<Store | null> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'STORE_LOOKUP_FAILED')
  }

  return data as Store | null
}

export async function incrementProductCount(storeId: number): Promise<void> {
  const store = await findStoreById(storeId)
  if (!store) return

  const { error } = await supabaseAdmin
    .from('stores')
    .update({
      product_count: (store.product_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', storeId)

  if (error) {
    throw new AppError(400, error.message, 'STORE_UPDATE_FAILED')
  }
}

export async function incrementOrderCount(storeId: number): Promise<void> {
  const store = await findStoreById(storeId)
  if (!store) return

  const { error } = await supabaseAdmin
    .from('stores')
    .update({
      order_count: (store.order_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', storeId)

  if (error) {
    throw new AppError(400, error.message, 'STORE_UPDATE_FAILED')
  }
}

export async function activateBusinessSubscription(
  storeId: number,
  expiresAt: string
): Promise<Store> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .update({
      subscription_plan: 'business',
      subscription_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', storeId)
    .select('*')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'SUBSCRIPTION_ACTIVATE_FAILED')
  }

  return data as Store
}

export async function downgradeStoreToStarter(storeId: number): Promise<Store> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .update({
      subscription_plan: 'starter',
      subscription_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', storeId)
    .select('*')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'SUBSCRIPTION_DOWNGRADE_FAILED')
  }

  return data as Store
}
