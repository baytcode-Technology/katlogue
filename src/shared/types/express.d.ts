export type AuthUser = {
  id: string
  email?: string
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser
    }
  }
}

export {}
