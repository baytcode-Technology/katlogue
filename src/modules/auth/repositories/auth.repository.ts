import { supabaseAuth } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { AuthSession, VerifyOtpResult } from '../types/auth.types.js'

function mapAuthError(error: { message: string; status?: number }, fallback: string): never {
  const status = error.status ?? 400
  if (status === 429) {
    throw new AppError(429, 'Too many OTP requests. Please try again later.', 'RATE_LIMITED')
  }
  throw new AppError(status >= 400 && status < 500 ? status : 400, error.message || fallback, 'AUTH_ERROR')
}

export async function sendSignInOtp(email: string): Promise<void> {
  const { error } = await supabaseAuth.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  })

  if (error) {
    mapAuthError(error, 'Failed to send OTP')
  }
}

export async function verifySignInOtp(
  email: string,
  token: string
): Promise<VerifyOtpResult> {
  const { data, error } = await supabaseAuth.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  if (error || !data.session || !data.user) {
    mapAuthError(error ?? { message: 'Invalid or expired OTP' }, 'Invalid or expired OTP')
  }

  const { user, session } = data

  return buildAuthResult(user, session)
}

export async function refreshAuthSession(refreshToken: string): Promise<VerifyOtpResult> {
  const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken })

  if (error || !data.session || !data.user) {
    throw new AppError(
      401,
      error?.message ?? 'Invalid or expired refresh token',
      'INVALID_REFRESH_TOKEN'
    )
  }

  return buildAuthResult(data.user, data.session)
}

export async function signInWithGoogleIdToken(idToken: string): Promise<VerifyOtpResult> {
  const { data, error } = await supabaseAuth.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })

  if (error || !data.session || !data.user) {
    mapAuthError(error ?? { message: 'Google sign-in failed' }, 'Google sign-in failed')
  }

  return buildAuthResult(data.user, data.session)
}

function buildAuthResult(
  user: {
    id: string
    email?: string
    created_at: string
    last_sign_in_at?: string
  },
  session: {
    access_token: string
    refresh_token: string
    expires_in: number
    expires_at?: number
    token_type: string
  }
): VerifyOtpResult {
  const isNewUser = (() => {
    const createdAt = user.created_at
    const lastSignIn = user.last_sign_in_at
    if (!createdAt || !lastSignIn) return false
    return Math.abs(new Date(createdAt).getTime() - new Date(lastSignIn).getTime()) < 5000
  })()

  return {
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
      isNewUser,
    },
    session: mapSession(session),
  }
}

function mapSession(session: {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at?: number
  token_type: string
}): AuthSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
    expiresAt: session.expires_at ?? 0,
    tokenType: session.token_type,
  }
}
