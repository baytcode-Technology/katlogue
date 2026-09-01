import * as authRepository from '../repositories/auth.repository.js'

export async function deleteAccount(userId: string): Promise<void> {
  await authRepository.deleteUserAccount(userId)
}
