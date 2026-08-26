import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import * as processRevenueCatWebhookService from '../services/process-revenuecat-webhook.service.js'

export const revenueCatWebhook = asyncHandler(async (req: Request, res: Response) => {
  await processRevenueCatWebhookService.processRevenueCatWebhook(
    req.body as processRevenueCatWebhookService.RevenueCatWebhookPayload,
    req.headers.authorization
  )
  res.status(200).json({ success: true })
})
