import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { RequiredStoreQuery } from '../validations/store.validation.js'
import type { SetCustomDomainBody } from '../validations/custom-domain.validation.js'
import * as customDomainService from '../services/custom-domain.service.js'

function requireUser(req: Request) {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }
  return req.authUser
}

export const getCustomDomain = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req)
  const { store_id } = req.validatedQuery as RequiredStoreQuery
  const data = await customDomainService.getCustomDomain(user.id, store_id)
  res.status(200).json({ success: true, data })
})

export const setCustomDomain = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req)
  const { store_id } = req.validatedQuery as RequiredStoreQuery
  const body = req.body as SetCustomDomainBody
  const data = await customDomainService.setCustomDomain(user.id, store_id, body.domain)
  res.status(200).json({ success: true, message: 'Custom domain saved', data })
})

export const verifyCustomDomain = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req)
  const { store_id } = req.validatedQuery as RequiredStoreQuery
  const data = await customDomainService.verifyCustomDomain(user.id, store_id)
  res.status(200).json({
    success: true,
    message: data.status === 'active' ? 'Domain is active' : 'Domain is not verified yet',
    data,
  })
})

export const deleteCustomDomain = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req)
  const { store_id } = req.validatedQuery as RequiredStoreQuery
  const data = await customDomainService.removeCustomDomain(user.id, store_id)
  res.status(200).json({ success: true, message: 'Custom domain removed', data })
})
