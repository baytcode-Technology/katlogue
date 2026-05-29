import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { SendTemplateBody } from '../validations/send-template.validation.js'
import { sendWhatsAppTemplateMessage } from '../services/send-template-message.service.js'

export const sendTemplate = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const body = req.body as SendTemplateBody
  const result = await sendWhatsAppTemplateMessage({
    to: body.to,
    templateName: body.templateName,
    languageCode: body.languageCode,
    storeId: body.storeId ?? body.store_id,
    ownerId: req.authUser.id,
  })

  res.status(200).json({
    success: true,
    message: 'Message sent successfully',
    data: result,
  })
})

