import express, { Router } from 'express'

import { env } from '../../../config/env.js'

import { AppError } from '../../../shared/errors/app.error.js'

import { asyncHandler } from '../../../shared/helpers/async-handler.js'

import { processWhatsAppWebhook } from '../services/process-webhook.service.js'

import { verifyWebhook, verifyWebhookSignature } from '../services/whatsapp.service.js'



const router = Router()



router.use(express.raw({ type: 'application/json' }))



router.get(

  '/',

  asyncHandler(async (req, res) => {

    const challenge = verifyWebhook({

      mode: String(req.query['hub.mode'] ?? ''),

      token: String(req.query['hub.verify_token'] ?? ''),

      challenge: String(req.query['hub.challenge'] ?? ''),

      verifyToken: env.WHATSAPP.WEBHOOK_VERIFY_TOKEN,

    })



    res.status(200).send(challenge)

  })

)



router.post(

  '/',

  asyncHandler(async (req, res) => {

    const raw = req.body as Buffer

    verifyWebhookSignature(raw, req.header('x-hub-signature-256') ?? undefined)



    let body: unknown = null

    try {

      body = JSON.parse(raw.toString('utf8'))

    } catch {

      throw new AppError(400, 'Invalid JSON payload', 'WEBHOOK_BAD_JSON')

    }



    res.status(200).json({ success: true })



    void processWhatsAppWebhook(body).catch((err) => {

      console.error('[whatsapp webhook] processing failed', err)

    })

  })

)



export default router


