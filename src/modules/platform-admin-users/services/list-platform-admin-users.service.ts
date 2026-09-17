import * as repo from '../repositories/platform-admin-users.repository.js'
import { normalizePlanFilter, toUserCard } from '../lib/admin-user-mappers.js'
import type {
  ListPlatformAdminUsersQuery,
  ListPlatformAdminUsersResult,
} from '../types/platform-admin-users.types.js'
import type { Store } from '../../stores/types/store.types.js'

const SIGNED_AFTER_MS: Record<NonNullable<ListPlatformAdminUsersQuery['signedAfter']>, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
}

function matchesSearch(email: string | null, phone: string | null, stores: Store[], q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  if (email?.toLowerCase().includes(needle)) return true
  if (phone?.toLowerCase().includes(needle)) return true
  return stores.some((store) => {
    return (
      store.name.toLowerCase().includes(needle) ||
      (store.whatsapp_number ?? '').toLowerCase().includes(needle) ||
      store.slug.toLowerCase().includes(needle)
    )
  })
}

export async function listPlatformAdminUsers(
  query: ListPlatformAdminUsersQuery
): Promise<ListPlatformAdminUsersResult> {
  const [authUsers, stores] = await Promise.all([repo.listAllAuthUsers(), repo.listAllStoresForAdmin()])

  const storesByOwner = new Map<string, Store[]>()
  for (const store of stores) {
    const list = storesByOwner.get(store.owner_id) ?? []
    list.push(store)
    storesByOwner.set(store.owner_id, list)
  }

  const planFilter = normalizePlanFilter(query.plan)
  const signedAfterMs = query.signedAfter ? SIGNED_AFTER_MS[query.signedAfter] : null
  const signedCutoff = signedAfterMs ? Date.now() - signedAfterMs : null

  const cards = authUsers
    .map((user) => toUserCard(user, storesByOwner.get(user.id) ?? []))
    .filter((card) => {
      const userStores = storesByOwner.get(card.id) ?? []

      if (query.hasStore === 'yes' && !card.has_store) return false
      if (query.hasStore === 'no' && card.has_store) return false

      if (planFilter) {
        if (!userStores.some((store) => store.subscription_plan === planFilter)) return false
      }

      if (signedCutoff && new Date(card.created_at).getTime() < signedCutoff) return false

      if (query.q && !matchesSearch(card.email, card.phone, userStores, query.q)) return false

      return true
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const total = cards.length
  const start = (query.page - 1) * query.limit
  const pageItems = cards.slice(start, start + query.limit)

  return {
    users: pageItems,
    count: pageItems.length,
    page: query.page,
    limit: query.limit,
    total,
  }
}
