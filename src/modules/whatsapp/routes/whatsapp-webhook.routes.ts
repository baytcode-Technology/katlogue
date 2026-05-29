import crypto from 'crypto'
import express, { Router } from 'express'
import { env } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { processWhatsAppWebhook } from '../services/process-webhook.service.js'

const router = Router()

router.use(express.raw({ type: 'application/json' }))

function assertSignature(rawBody: Buffer, signatureHeader: string | undefined) {
  const secret = env.WHATSAPP.APP_SECRET
  if (!secret) return

  const signature = signatureHeader?.trim()
  if (!signature?.startsWith('sha256=')) {
    throw new AppError(401, 'Missing webhook signature', 'WEBHOOK_SIGNATURE_MISSING')
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  const actual = signature.slice('sha256='.length)
  const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  if (!ok) {
    throw new AppError(401, 'Invalid webhook signature', 'WEBHOOK_SIGNATURE_INVALID')
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const mode = String(req.query['hub.mode'] ?? '')
    const token = String(req.query['hub.verify_token'] ?? '')
    const challenge = String(req.query['hub.challenge'] ?? '')

    if (!env.WHATSAPP.WEBHOOK_VERIFY_TOKEN) {
      throw new AppError(
        503,
        'WhatsApp webhook is not configured on this server',
        'WHATSAPP_WEBHOOK_NOT_CONFIGURED'
      )
    }

    if (mode === 'subscribe' && token === env.WHATSAPP.WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(challenge)
      return
    }

    throw new AppError(403, 'Webhook verification failed', 'WEBHOOK_FORBIDDEN')
  })
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const raw = req.body as Buffer
    assertSignature(raw, req.header('x-hub-signature-256') ?? undefined)

    let body: unknown = null
    try {
      body = JSON.parse(raw.toString('utf8'))
    } catch {
      throw new AppError(400, 'Invalid JSON payload', 'WEBHOOK_BAD_JSON')
    }

    res.status(200).json({ success: true })
    await processWhatsAppWebhook(body)
  })
)

export default router

