import { AppError } from '../../../shared/errors/app.error.js'
import * as repo from '../repositories/platform-admin-users.repository.js'
import {
  authProviders,
  toCheckoutSummary,
  toStoreSummary,
} from '../lib/admin-user-mappers.js'
import type { PlatformAdminUserDetail } from '../types/platform-admin-users.types.js'

export async function getPlatformAdminUser(userId: string): Promise<PlatformAdminUserDetail> {
  const user = await repo.getAuthUserById(userId)
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND')
  }

  const stores = await repo.listStoresByOwnerId(userId)
  const checkouts = await repo.listCheckoutsByStoreIds(stores.map((store) => store.id))

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone || null,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
      providers: authProviders(user),
    },
    stores: stores.map(toStoreSummary),
    subscriptions: checkouts.map(toCheckoutSummary),
  }
}
