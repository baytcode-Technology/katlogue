import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { Store } from '../../stores/types/store.types.js'
import type { SubscriptionCheckout } from '../../subscriptions/types/subscription-checkout.types.js'
import type { AuthUserRow } from '../lib/admin-user-mappers.js'

const STORE_ADMIN_COLUMNS = [
  'id',
  'owner_id',
  'name',
  'slug',
  'logo_url',
  'whatsapp_number',
  'wa_phone_number_id',
  'ig_user_id',
  'ig_username',
  'currency',
  'country',
  'timezone',
  'payment_config',
  'ai_auto_reply_enabled',
  'ai_third_party_consent_at',
  'industry',
  'is_active',
  'subscription_plan',
  'subscription_expires_at',
  'product_count',
  'order_count',
  'created_at',
  'updated_at',
].join(', ')

const AUTH_PAGE_SIZE = 200
const AUTH_MAX_PAGES = 25
const STORE_PAGE_SIZE = 1000

export async function listAllAuthUsers(): Promise<AuthUserRow[]> {
  const users: AuthUserRow[] = []

  for (let page = 1; page <= AUTH_MAX_PAGES; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    })

    if (error) {
      throw new AppError(400, error.message, 'AUTH_USERS_LOOKUP_FAILED')
    }

    const batch = (data.users ?? []) as AuthUserRow[]
    users.push(...batch)
    if (batch.length < AUTH_PAGE_SIZE) break
  }

  return users
}

export async function getAuthUserById(userId: string): Promise<AuthUserRow | null> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !data.user) return null
  return data.user as AuthUserRow
}

export async function listAllStoresForAdmin(): Promise<Store[]> {
  const stores: Store[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('stores')
      .select(STORE_ADMIN_COLUMNS)
      .order('created_at', { ascending: false })
      .range(from, from + STORE_PAGE_SIZE - 1)

    if (error) {
      throw new AppError(400, error.message, 'STORE_LOOKUP_FAILED')
    }

    const batch = (data ?? []) as unknown as Store[]
    stores.push(...batch)
    if (batch.length < STORE_PAGE_SIZE) break
    from += STORE_PAGE_SIZE
  }

  return stores
}

export async function listStoresByOwnerId(ownerId: string): Promise<Store[]> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .select(STORE_ADMIN_COLUMNS)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new AppError(400, error.message, 'STORE_LOOKUP_FAILED')
  }

  return (data ?? []) as unknown as Store[]
}

export async function listCheckoutsByStoreIds(storeIds: number[]): Promise<SubscriptionCheckout[]> {
  if (storeIds.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('subscription_checkouts')
    .select('*')
    .in('store_id', storeIds)
    .order('created_at', { ascending: false })

  if (error) {
    throw new AppError(400, error.message, 'SUBSCRIPTION_CHECKOUT_LOOKUP_FAILED')
  }

  return (data ?? []) as SubscriptionCheckout[]
}
