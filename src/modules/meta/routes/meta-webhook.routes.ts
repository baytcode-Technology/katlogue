import express, { Router } from 'express'
import { env } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import {
  verifyMetaWebhookSignatureAny,
  verifyMetaWebhookSubscribe,
} from '../../../shared/utils/meta-webhook.js'
import { processInstagramWebhook } from '../../instagram/services/process-instagram-webhook.service.js'
import { processWhatsAppWebhook } from '../../whatsapp/services/process-webhook.service.js'

const router = Router()

router.use(express.raw({ type: 'application/json' }))

function resolveWebhookVerifyToken(): string | undefined {
  return (
    env.INSTAGRAM.WEBHOOK_VERIFY_TOKEN ??
    env.WHATSAPP.WEBHOOK_VERIFY_TOKEN
  )
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const challenge = verifyMetaWebhookSubscribe({
      mode: String(req.query['hub.mode'] ?? ''),
      token: String(req.query['hub.verify_token'] ?? ''),
      challenge: String(req.query['hub.challenge'] ?? ''),
      verifyToken: resolveWebhookVerifyToken(),
      notConfiguredMessage: 'Meta webhook verify token is not configured on this server',
    })

    res.status(200).send(challenge)
  })
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const raw = req.body as Buffer

    verifyMetaWebhookSignatureAny(raw, req.header('x-hub-signature-256') ?? undefined, [
      env.META.APP_SECRET,
      env.INSTAGRAM.APP_SECRET,
      env.WHATSAPP.APP_SECRET,
    ])

    let body: unknown = null
    try {
      body = JSON.parse(raw.toString('utf8'))
    } catch {
      throw new AppError(400, 'Invalid JSON payload', 'WEBHOOK_BAD_JSON')
    }

    const objectType =
      body && typeof body === 'object' && 'object' in body
        ? String((body as { object?: string }).object ?? '')
        : ''

    console.info('[meta webhook] POST object=%s bytes=%d', objectType || 'unknown', raw.length)

    res.status(200).json({ success: true })

    if (objectType === 'instagram' || objectType === 'page') {
      void processInstagramWebhook(body).catch((err) => {
        console.error('[instagram webhook] processing failed', err)
      })
      return
    }

    if (objectType === 'whatsapp_business_account') {
      void processWhatsAppWebhook(body).catch((err) => {
        console.error('[whatsapp webhook] processing failed', err)
      })
      return
    }

    console.info('[meta webhook] unhandled object type=%s', objectType || 'missing')
  })
)

export default router
