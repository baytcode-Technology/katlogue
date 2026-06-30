import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeStaffService from '../services/store-staff.service.js'
import type {
  InviteStaffBody,
  StaffParams,
  StaffStoreQuery,
} from '../validations/store.validation.js'

export const listStoreStaff = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id } = req.validatedQuery as StaffStoreQuery
  const members = await storeStaffService.listStoreStaff(req.authUser.id, store_id)

  res.status(200).json({
    success: true,
    message: 'Staff loaded',
    data: { members },
  })
})

export const inviteStoreStaff = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id } = req.validatedQuery as StaffStoreQuery
  const { email } = req.body as InviteStaffBody
  const staff = await storeStaffService.inviteStoreStaff(
    req.authUser.id,
    store_id,
    email
  )

  res.status(201).json({
    success: true,
    message: staff.status === 'pending' ? 'Invite sent' : 'Staff added',
    data: { staff },
  })
})

export const removeStoreStaff = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id } = req.validatedQuery as StaffStoreQuery
  const { id } = req.params as unknown as StaffParams
  await storeStaffService.removeStoreStaff(req.authUser.id, store_id, id)

  res.status(200).json({
    success: true,
    message: 'Staff removed',
    data: {},
  })
})
