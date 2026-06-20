import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { z } from 'zod'
import * as uploadService from '../services/upload-product-images.service.js'

import { entityId } from '../../../shared/validations/zod-helpers.js'

const bodySchema = z.object({
  store_id: entityId('Invalid store id'),
})

export const uploadProductImages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid request', 'VALIDATION_ERROR')
  }

  const files = req.files as { buffer: Buffer; mimetype: string; originalname: string }[] | undefined
  if (!files?.length) {
    const hasStoreId = typeof req.body?.store_id === 'string' && req.body.store_id.length > 0
    const hint = hasStoreId
      ? ' Send multipart field "images" with file data (React Native must use a file:// URI).'
      : ''
    throw new AppError(400, `At least one image file is required.${hint}`, 'NO_FILES')
  }

  const urls = await uploadService.uploadProductImages(
    req.authUser.id,
    parsed.data.store_id,
    files
  )

  res.status(201).json({
    success: true,
    message: 'Images uploaded successfully',
    data: { urls },
  })
})
