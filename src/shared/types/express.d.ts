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
    }
  }
}

export {}
