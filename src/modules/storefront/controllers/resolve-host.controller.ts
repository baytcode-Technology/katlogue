import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { resolveHostToSlug } from '../../stores/services/custom-domain.service.js'

export const resolvePublicHost = asyncHandler(async (req: Request, res: Response) => {
  const host = String(req.query.host ?? req.headers.host ?? '').trim()
  if (!host) {
    throw new AppError(400, 'host is required', 'HOST_REQUIRED')
  }

  const resolved = await resolveHostToSlug(host)
  if (!resolved) {
    res.status(200).json({ success: true, data: { slug: null } })
    return
  }

  res.status(200).json({ success: true, data: { slug: resolved.slug } })
})
