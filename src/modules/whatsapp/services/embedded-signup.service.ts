import axios from 'axios'
import { env } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'

export type MetaTokenExchangeResult = {
  accessToken: string
  tokenType: string | null
  expiresIn: number | null
}

function assertMetaOAuthConfigured() {
  if (!env.META.APP_ID || !env.META.APP_SECRET || !env.META.OAUTH_REDIRECT_URI) {
    throw new AppError(
      503,
      'Meta OAuth is not configured on this server',
      'META_OAUTH_NOT_CONFIGURED'
    )
  }
}

export function buildMetaOAuthUrl(input: { state: string }): string {
  assertMetaOAuthConfigured()

  const qs = new URLSearchParams({
    client_id: env.META.APP_ID!,
    redirect_uri: env.META.OAUTH_REDIRECT_URI!,
    response_type: 'code',
    state: input.state,
    // Basic scopes for WhatsApp management. Meta may require additional permissions later.
    scope: [
      'business_management',
      'whatsapp_business_management',
      'whatsapp_business_messaging',
    ].join(','),
  }).toString()

  return `https://www.facebook.com/${encodeURIComponent(env.WHATSAPP.API_VERSION)}/dialog/oauth?${qs}`
}

export async function exchangeCodeForAccessToken(code: string): Promise<MetaTokenExchangeResult> {
  assertMetaOAuthConfigured()

  const url = `https://graph.facebook.com/${env.WHATSAPP.API_VERSION}/oauth/access_token`

  try {
    const { data } = await axios.get<{
      access_token?: string
      token_type?: string
      expires_in?: number
    }>(url, {
      params: {
        client_id: env.META.APP_ID!,
        client_secret: env.META.APP_SECRET!,
        redirect_uri: env.META.OAUTH_REDIRECT_URI!,
        code,
      },
      timeout: 15_000,
    })

    const accessToken = data.access_token?.trim()
    if (!accessToken) {
      throw new AppError(502, 'Meta did not return an access token', 'META_OAUTH_NO_TOKEN')
    }

    return {
      accessToken,
      tokenType: data.token_type ?? null,
      expiresIn: typeof data.expires_in === 'number' ? data.expires_in : null,
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(400, 'Failed to exchange Meta OAuth code', 'META_OAUTH_EXCHANGE_FAILED')
  }
}

