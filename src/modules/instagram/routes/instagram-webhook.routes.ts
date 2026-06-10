import express, { Router } from 'express'
import { env } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import {
  verifyMetaWebhookSignature,
  verifyMetaWebhookSubscribe,
} from '../../../shared/utils/meta-webhook.js'
import { processInstagramWebhook } from '../services/process-instagram-webhook.service.js'

const router = Router()

router.use(express.raw({ type: 'application/json' }))

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const challenge = verifyMetaWebhookSubscribe({
      mode: String(req.query['hub.mode'] ?? ''),
      token: String(req.query['hub.verify_token'] ?? ''),
      challenge: String(req.query['hub.challenge'] ?? ''),
      verifyToken: env.INSTAGRAM.WEBHOOK_VERIFY_TOKEN,
      notConfiguredMessage: 'Instagram webhook verify token is not configured on this server',
    })

    res.status(200).send(challenge)
  })
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const raw = req.body as Buffer
    verifyMetaWebhookSignature(
      raw,
      req.header('x-hub-signature-256') ?? undefined,
      env.INSTAGRAM.APP_SECRET ?? env.META.APP_SECRET ?? env.WHATSAPP.APP_SECRET
    )

    let body: unknown = null
    try {
      body = JSON.parse(raw.toString('utf8'))
    } catch {
      throw new AppError(400, 'Invalid JSON payload', 'WEBHOOK_BAD_JSON')
    }

    res.status(200).json({ success: true })

    void processInstagramWebhook(body).catch((err) => {
      console.error('[instagram webhook] processing failed', err)
    })
  })
)

export default router
