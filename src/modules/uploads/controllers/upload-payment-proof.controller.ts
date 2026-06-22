import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as uploadPaymentProofService from '../services/upload-payment-proof.service.js'

export const uploadPaymentProof = asyncHandler(async (req: Request, res: Response) => {
  if (!req.store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  if (!req.file) {
    throw new AppError(400, 'Payment proof image is required', 'PAYMENT_PROOF_REQUIRED')
  }

  const storeId = req.store.id
  const url = await uploadPaymentProofService.uploadPaymentProof(storeId, {
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
  })

  res.status(201).json({
    success: true,
    data: { url },
  })
})

