import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'

const authOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
} as const

/** Client for OTP sign-in / verify (uses anon key). */
export const supabaseAuth = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  authOptions
)

/** Admin client for privileged operations after auth. */
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  authOptions
)

export default supabaseAdmin
