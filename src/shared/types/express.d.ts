import type { PublicStore } from '../../modules/storefront/types/public-store.types.js'

export type AuthUser = {
  id: string
  email?: string
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser
      store?: PublicStore
      /** Set by validateQuery — use this instead of req.query after validation (Express 5 query is read-only). */
      validatedQuery?: unknown
    }
  }
}

export {}
