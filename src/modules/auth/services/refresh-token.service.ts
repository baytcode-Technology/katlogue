import * as authRepository from '../repositories/auth.repository.js'
import type { RefreshTokenInput } from '../validations/auth.validation.js'

export async function refreshAuthSession(input: RefreshTokenInput) {
  return authRepository.refreshAuthSession(input.refreshToken)
}
