import { Router } from 'express'
import express from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import * as processRazorpayWebhookService from '../services/process-razorpay-webhook.service.js'

const router = Router()

router.post(
  '/',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const rawBody =
      typeof req.body === 'string'
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body.toString('utf8')
          : JSON.stringify(req.body)

    await processRazorpayWebhookService.processRazorpayWebhook(
      rawBody,
      req.headers['x-razorpay-signature'] as string | undefined
    )

    res.status(200).json({ success: true })
  })
)

export default router
