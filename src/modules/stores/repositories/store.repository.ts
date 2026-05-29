import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { CreateStoreInput, Store } from '../types/store.types.js'

export async function assertStoreOwner(
  storeId: string,
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

export async function findStoreById(storeId: string): Promise<Store | null> {
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

export async function findStoreByWhatsAppWebhookTarget(input: {
  waPhoneNumberId?: string | null
  displayPhoneNumber?: string | null
}): Promise<Store | null> {
  const waPhoneNumberId = input.waPhoneNumberId?.trim()
  const displayPhoneNumber = input.displayPhoneNumber?.trim()

  if (waPhoneNumberId) {
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
