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
} as const
