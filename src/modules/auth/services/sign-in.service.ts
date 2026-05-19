import * as authRepository from '../repositories/auth.repository.js'
import type { SignInInput } from '../validations/auth.validation.js'

export async function sendSignInOtp(input: SignInInput): Promise<void> {
  await authRepository.sendSignInOtp(input.email.toLowerCase().trim())
}
