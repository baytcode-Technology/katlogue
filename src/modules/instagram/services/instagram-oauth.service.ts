import axios from 'axios'
import { env, isInstagramOAuthConfigured } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'

export type InstagramTokenExchangeResult = {
  accessToken: string
  tokenType: string | null
  expiresIn: number | null
}

export type InstagramProfile = {
  userId: string
  username: string | null
}

function assertInstagramOAuthConfigured() {
  if (!isInstagramOAuthConfigured()) {
    throw new AppError(
      503,
      'Instagram OAuth is not configured on this server',
      'INSTAGRAM_OAUTH_NOT_CONFIGURED'
    )
  }
}

export function buildInstagramOAuthUrl(input: { state: string }): string {
  assertInstagramOAuthConfigured()

  const params: Record<string, string> = {
    client_id: env.INSTAGRAM.APP_ID!,
    redirect_uri: env.INSTAGRAM.OAUTH_REDIRECT_URI!,
    response_type: 'code',
    state: input.state,
    scope: [
      'instagram_business_basic',
      'instagram_business_manage_messages',
    ].join(','),
  }

  const qs = new URLSearchParams(params).toString()
  return `https://www.instagram.com/oauth/authorize?${qs}`
}

export async function exchangeCodeForAccessToken(
  code: string
): Promise<InstagramTokenExchangeResult> {
  assertInstagramOAuthConfigured()

  try {
    const body = new URLSearchParams({
      client_id: env.INSTAGRAM.APP_ID!,
      client_secret: env.INSTAGRAM.APP_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: env.INSTAGRAM.OAUTH_REDIRECT_URI!,
      code,
    })

    const { data } = await axios.post<{
      access_token?: string
      token_type?: string
      expires_in?: number
      data?: Array<{ access_token?: string; user_id?: string }>
    }>('https://api.instagram.com/oauth/access_token', body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15_000,
    })

    const accessToken =
      data.access_token?.trim() ??
      data.data?.[0]?.access_token?.trim() ??
      ''

    if (!accessToken) {
      throw new AppError(502, 'Instagram did not return an access token', 'INSTAGRAM_OAUTH_NO_TOKEN')
    }

    return {
      accessToken,
      tokenType: data.token_type ?? null,
      expiresIn: typeof data.expires_in === 'number' ? data.expires_in : null,
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(400, 'Failed to exchange Instagram OAuth code', 'INSTAGRAM_OAUTH_EXCHANGE_FAILED')
  }
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<InstagramTokenExchangeResult> {
  assertInstagramOAuthConfigured()

  try {
    const { data } = await axios.get<{
      access_token?: string
      token_type?: string
      expires_in?: number
    }>(`https://graph.instagram.com/access_token`, {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: env.INSTAGRAM.APP_SECRET!,
        access_token: shortLivedToken,
      },
      timeout: 15_000,
    })

    const accessToken = data.access_token?.trim()
    if (!accessToken) {
      throw new AppError(502, 'Instagram did not return a long-lived token', 'INSTAGRAM_OAUTH_NO_TOKEN')
    }

    return {
      accessToken,
      tokenType: data.token_type ?? null,
      expiresIn: typeof data.expires_in === 'number' ? data.expires_in : null,
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(400, 'Failed to get long-lived Instagram token', 'INSTAGRAM_OAUTH_LONG_LIVED_FAILED')
  }
}

export async function fetchInstagramProfile(accessToken: string): Promise<InstagramProfile> {
  try {
    const { data } = await axios.get<{
      user_id?: string
      id?: string
      username?: string
    }>(`https://graph.instagram.com/${env.INSTAGRAM.API_VERSION}/me`, {
      params: {
        fields: 'user_id,username',
        access_token: accessToken,
      },
      timeout: 15_000,
    })

    const userId = String(data.user_id ?? data.id ?? '').trim()
    if (!userId) {
      throw new AppError(502, 'Instagram did not return a user id', 'INSTAGRAM_PROFILE_FAILED')
    }

    return {
      userId,
      username: data.username?.trim() ?? null,
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(400, 'Failed to fetch Instagram profile', 'INSTAGRAM_PROFILE_FAILED')
  }
}
