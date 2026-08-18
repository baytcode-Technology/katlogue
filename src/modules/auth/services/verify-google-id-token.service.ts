import { env } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'

type GoogleTokenInfo = {
  aud?: string
  azp?: string
  iss?: string
  email?: string
  email_verified?: string | boolean
  name?: string
  picture?: string
  sub?: string
  error?: string
  error_description?: string
}

export type VerifiedGoogleProfile = {
  email: string
  name?: string
  picture?: string
  sub?: string
}

const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com'])

export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleProfile> {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  )
  const info = (await response.json()) as GoogleTokenInfo

  if (!response.ok || info.error) {
    throw new AppError(
      401,
      info.error_description || info.error || 'Google ID token is invalid',
      'GOOGLE_TOKEN_INVALID'
    )
  }

  if (!info.iss || !GOOGLE_ISSUERS.has(info.iss)) {
    throw new AppError(401, 'Google ID token issuer is invalid', 'GOOGLE_TOKEN_INVALID')
  }

  const allowedAudiences = [env.GOOGLE.CLIENT_ID].filter(Boolean)
  if (allowedAudiences.length === 0) {
    throw new AppError(
      503,
      'Google OAuth is not configured on the server. Set GOOGLE_CLIENT_ID.',
      'GOOGLE_NOT_CONFIGURED'
    )
  }

  const audienceOk =
    (info.aud && allowedAudiences.includes(info.aud)) ||
    (info.azp && allowedAudiences.includes(info.azp))
  if (!audienceOk) {
    throw new AppError(401, 'Google ID token audience is invalid', 'GOOGLE_TOKEN_INVALID')
  }

  const email = info.email?.trim().toLowerCase()
  if (!email) {
    throw new AppError(401, 'Google account has no email', 'GOOGLE_TOKEN_INVALID')
  }

  const verified = info.email_verified === true || info.email_verified === 'true'
  if (!verified) {
    throw new AppError(401, 'Google email is not verified', 'GOOGLE_TOKEN_INVALID')
  }

  return {
    email,
    name: typeof info.name === 'string' ? info.name : undefined,
    picture: typeof info.picture === 'string' ? info.picture : undefined,
    sub: typeof info.sub === 'string' ? info.sub : undefined,
  }
}
