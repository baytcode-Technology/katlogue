import type { NextFunction, Request, Response } from 'express'
import { supabaseAuth } from '../../config/supabase.js'
import { AppError } from '../errors/app.error.js'

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      return next(new AppError(401, 'Missing or invalid authorization header', 'UNAUTHORIZED'))
    }

    const token = header.slice(7).trim()
    if (!token) {
      return next(new AppError(401, 'Missing access token', 'UNAUTHORIZED'))
    }

    const { data, error } = await supabaseAuth.auth.getUser(token)

    if (error || !data.user) {
      return next(new AppError(401, 'Invalid or expired access token', 'UNAUTHORIZED'))
    }

    req.authUser = {
      id: data.user.id,
      email: data.user.email,
    }

    next()
  } catch (err) {
    next(err)
  }
}
