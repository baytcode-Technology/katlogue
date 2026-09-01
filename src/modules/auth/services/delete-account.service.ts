import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as authRepository from '../repositories/auth.repository.js'

function throwStep(step: string, error: { message: string }): never {
  throw new AppError(
    400,
    `Account deletion failed while ${step}: ${error.message}`,
    'ACCOUNT_DELETE_FAILED'
  )
}

/** Remove app data that can block `auth.admin.deleteUser` (FK / RESTRICT). */
async function purgeUserData(userId: string): Promise<void> {
  const { error: staffInvitesError } = await supabaseAdmin
    .from('store_staff')
    .delete()
    .eq('invited_by', userId)

  if (staffInvitesError) {
    throwStep('removing staff invites', staffInvitesError)
  }

  const { error: staffMembershipError } = await supabaseAdmin
    .from('store_staff')
    .delete()
    .eq('user_id', userId)

  if (staffMembershipError) {
    throwStep('removing staff memberships', staffMembershipError)
  }

  const { error: pushTokensError } = await supabaseAdmin
    .from('store_push_tokens')
    .delete()
    .eq('user_id', userId)

  if (pushTokensError) {
    throwStep('removing push tokens', pushTokensError)
  }

  const { error: storesError } = await supabaseAdmin
    .from('stores')
    .delete()
    .eq('owner_id', userId)

  if (storesError) {
    throwStep('removing owned stores', storesError)
  }

  const { error: supportError } = await supabaseAdmin
    .from('support_conversations')
    .delete()
    .eq('owner_id', userId)

  if (supportError) {
    throwStep('removing support conversations', supportError)
  }

  const { error: checkoutError } = await supabaseAdmin
    .from('subscription_checkouts')
    .delete()
    .eq('owner_id', userId)

  if (checkoutError) {
    throwStep('removing subscription checkouts', checkoutError)
  }
}

export async function deleteAccount(userId: string): Promise<void> {
  await purgeUserData(userId)
  await authRepository.deleteUserAccount(userId)
}
