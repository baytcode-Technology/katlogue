import dotenv from 'dotenv'
import path from 'path'

// Load from backend/ when running `npm run dev` from that folder
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 5000),
  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_ANON_KEY: requireEnv('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  /** Base domain for store subdomains, e.g. katlogue.com → my-shop.katlogue.com */
  STOREFRONT_BASE_DOMAIN: process.env.STOREFRONT_BASE_DOMAIN ?? 'localhost',
  /**
   * Public API URL for OpenAPI docs (optional).
   * e.g. https://aishopy.up.railway.app — Railway may also set RAILWAY_PUBLIC_DOMAIN.
   */
  API_PUBLIC_URL: process.env.API_PUBLIC_URL?.trim() || undefined,
  /** Supabase Storage bucket for product images (must exist and be public) */
  SUPABASE_STORAGE_BUCKET:
    process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'product-images',
  WHATSAPP: {
    ACCESS_TOKEN: optionalEnv('WHATSAPP_ACCESS_TOKEN'),
    PHONE_NUMBER_ID: optionalEnv('WHATSAPP_PHONE_NUMBER_ID'),
    BUSINESS_ACCOUNT_ID: optionalEnv('WHATSAPP_BUSINESS_ACCOUNT_ID'),
    API_VERSION: optionalEnv('WHATSAPP_API_VERSION') ?? 'v20.0',
    WEBHOOK_VERIFY_TOKEN:
      optionalEnv('WHATSAPP_WEBHOOK_VERIFY_TOKEN') ?? optionalEnv('WHATSAPP_VERIFY_TOKEN'),
    APP_SECRET: optionalEnv('WHATSAPP_APP_SECRET'),
  },
  META: {
    APP_ID: optionalEnv('META_APP_ID'),
    APP_SECRET: optionalEnv('META_APP_SECRET'),
    EMBEDDED_SIGNUP_CONFIG_ID: optionalEnv('META_EMBEDDED_SIGNUP_CONFIG_ID'),
    OAUTH_REDIRECT_URI: optionalEnv('META_OAUTH_REDIRECT_URI'),
  },
} as const

export function isWhatsAppConfigured(): boolean {
  return Boolean(env.WHATSAPP.ACCESS_TOKEN && env.WHATSAPP.PHONE_NUMBER_ID)
}
