export type AuthUser = {
  id: string
  email: string | undefined
  createdAt: string
  isNewUser: boolean
}

export type AuthSession = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  expiresAt: number
  tokenType: string
}

export type VerifyOtpResult = {
  user: AuthUser
  session: AuthSession
}
