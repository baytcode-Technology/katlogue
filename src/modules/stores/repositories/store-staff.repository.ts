import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { Store } from '../types/store.types.js'
import type {
  StaffListMember,
  StoreAccessRole,
  StoreStaffRow,
  StoreWithRole,
} from '../types/store-staff.types.js'
import { findStoreById } from './store.repository.js'

const STAFF_LIMIT = 4

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function assertStoreMember(
  storeId: number,
  userId: string
): Promise<StoreAccessRole> {
  const store = await findStoreById(storeId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'NOT_FOUND')
  }

  if (store.owner_id === userId) {
    return 'owner'
  }

  const { data, error } = await supabaseAdmin
    .from('store_staff')
    .select('id')
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'STAFF_LOOKUP_FAILED')
  }

  if (!data) {
    throw new AppError(403, 'You do not have access to this store', 'FORBIDDEN')
  }

  return 'staff'
}

export async function findOwnedStores(userId: string): Promise<Store[]> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new AppError(400, error.message, 'STORE_LOOKUP_FAILED')
  }

  return (data ?? []) as Store[]
}

export async function findStaffStores(userId: string): Promise<Store[]> {
  const { data: memberships, error: memberError } = await supabaseAdmin
    .from('store_staff')
    .select('store_id')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (memberError) {
    throw new AppError(400, memberError.message, 'STAFF_LOOKUP_FAILED')
  }

  const storeIds = (memberships ?? []).map((m) => m.store_id as number)
  if (storeIds.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('*')
    .in('id', storeIds)
    .order('created_at', { ascending: false })

  if (error) {
    throw new AppError(400, error.message, 'STORE_LOOKUP_FAILED')
  }

  return (data ?? []) as Store[]
}

export async function findStoresForUser(userId: string): Promise<StoreWithRole[]> {
  const owned = await findOwnedStores(userId)
  const staffStores = await findStaffStores(userId)
  const ownedIds = new Set(owned.map((s) => s.id))

  const result: StoreWithRole[] = [
    ...owned.map((store) => ({ store, role: 'owner' as const })),
    ...staffStores
      .filter((s) => !ownedIds.has(s.id))
      .map((store) => ({ store, role: 'staff' as const })),
  ]

  return result
}

export async function findStoreByIdForUser(
  storeId: number,
  userId: string
): Promise<StoreWithRole | null> {
  const store = await findStoreById(storeId)
  if (!store) return null

  if (store.owner_id === userId) {
    return { store, role: 'owner' }
  }

  const { data, error } = await supabaseAdmin
    .from('store_staff')
    .select('id')
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'STAFF_LOOKUP_FAILED')
  }

  if (!data) return null

  return { store, role: 'staff' }
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const normalized = normalizeEmail(email)
  let page = 1
  const perPage = 200

  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    })

    if (error) {
      throw new AppError(400, error.message, 'AUTH_LOOKUP_FAILED')
    }

    const match = data.users.find(
      (u) => u.email?.toLowerCase() === normalized
    )
    if (match?.id) return match.id

    if (data.users.length < perPage) break
    page += 1
  }

  return null
}

export async function getOwnerEmail(ownerId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(ownerId)
  if (error || !data.user) return null
  return data.user.email ?? null
}

export async function listStaffForStore(storeId: number): Promise<StaffListMember[]> {
  const store = await findStoreById(storeId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'NOT_FOUND')
  }

  const ownerEmail = (await getOwnerEmail(store.owner_id)) ?? 'Owner'

  const { data, error } = await supabaseAdmin
    .from('store_staff')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new AppError(400, error.message, 'STAFF_LOOKUP_FAILED')
  }

  const staffRows = (data ?? []) as StoreStaffRow[]

  return [
    {
      id: null,
      email: ownerEmail,
      user_id: store.owner_id,
      role: 'owner',
      status: 'owner',
    },
    ...staffRows.map((row) => ({
      id: row.id,
      email: row.email,
      user_id: row.user_id,
      role: 'staff' as const,
      status: row.status,
    })),
  ]
}

async function countStaffInvites(storeId: number): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('store_staff')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)

  if (error) {
    throw new AppError(400, error.message, 'STAFF_LOOKUP_FAILED')
  }

  return count ?? 0
}

export async function inviteStaff(
  storeId: number,
  ownerId: string,
  email: string
): Promise<StoreStaffRow> {
  const store = await findStoreById(storeId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'NOT_FOUND')
  }

  if (store.owner_id !== ownerId) {
    throw new AppError(403, 'Only the store owner can invite staff', 'FORBIDDEN')
  }

  const normalized = normalizeEmail(email)
  if (!normalized || !normalized.includes('@')) {
    throw new AppError(400, 'Invalid email address', 'INVALID_EMAIL')
  }

  const ownerEmail = await getOwnerEmail(store.owner_id)
  if (ownerEmail && normalizeEmail(ownerEmail) === normalized) {
    throw new AppError(400, 'The store owner cannot be added as staff', 'INVALID_STAFF')
  }

  const currentCount = await countStaffInvites(storeId)
  if (currentCount >= STAFF_LIMIT) {
    throw new AppError(
      400,
      `Staff limit reached (${STAFF_LIMIT} per store)`,
      'STAFF_LIMIT_REACHED'
    )
  }

  const existingUserId = await findAuthUserIdByEmail(normalized)

  const { data, error } = await supabaseAdmin
    .from('store_staff')
    .insert({
      store_id: storeId,
      email: normalized,
      user_id: existingUserId,
      invited_by: ownerId,
      status: existingUserId ? 'active' : 'pending',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new AppError(409, 'This email is already invited to this store', 'STAFF_EXISTS')
    }
    throw new AppError(400, error.message, 'STAFF_INVITE_FAILED')
  }

  return data as StoreStaffRow
}

export async function removeStaff(
  storeId: number,
  ownerId: string,
  staffId: number
): Promise<void> {
  const store = await findStoreById(storeId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'NOT_FOUND')
  }

  if (store.owner_id !== ownerId) {
    throw new AppError(403, 'Only the store owner can remove staff', 'FORBIDDEN')
  }

  const { error } = await supabaseAdmin
    .from('store_staff')
    .delete()
    .eq('id', staffId)
    .eq('store_id', storeId)

  if (error) {
    throw new AppError(400, error.message, 'STAFF_REMOVE_FAILED')
  }
}

export async function claimPendingStaffInvites(
  userId: string,
  email: string
): Promise<number> {
  const normalized = normalizeEmail(email)

  const { data, error } = await supabaseAdmin
    .from('store_staff')
    .update({
      user_id: userId,
      status: 'active',
    })
    .eq('status', 'pending')
    .ilike('email', normalized)
    .is('user_id', null)
    .select('id')

  if (error) {
    throw new AppError(400, error.message, 'STAFF_CLAIM_FAILED')
  }

  return data?.length ?? 0
}

export async function resolveOwnedStore(
  userId: string,
  storeId: number
): Promise<Store> {
  const match = await findStoreByIdForUser(storeId, userId)
  if (!match || match.role !== 'owner') {
    throw new AppError(
      403,
      'Only the store owner can perform this action',
      'FORBIDDEN'
    )
  }
  return match.store
}
