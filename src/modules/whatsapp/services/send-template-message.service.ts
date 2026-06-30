import axios from 'axios'

import { env } from '../../../config/env.js'

import { AppError } from '../../../shared/errors/app.error.js'

import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'

import * as storeRepository from '../../stores/repositories/store.repository.js'

import {

  isWhatsAppReadyForStore,

  resolveStoreWhatsAppCredentials,

  sendTemplateMessage,

} from './whatsapp.service.js'



export type SendWhatsAppTemplateInput = {

  storeId?: number

  ownerId?: string

  to: string

  templateName: string

  languageCode?: string

}



export type SendWhatsAppTemplateResult = {

  messages: Array<{ id: string }>

}



type MetaErrorResponse = {

  error?: {

    message?: string

    code?: number

    error_subcode?: number

  }

}



function metaErrorMessage(err: unknown, fallback: string): { message: string; code?: string } {

  if (!axios.isAxiosError(err)) return { message: fallback }



  const data = err.response?.data as MetaErrorResponse | undefined

  const message = data?.error?.message?.trim()

  const code = data?.error?.code

  const sub = data?.error?.error_subcode



  if (message) {

    return { message, code: code ? `META_${code}${sub ? `_${sub}` : ''}` : 'META_ERROR' }

  }



  return { message: fallback }

}



export async function sendWhatsAppTemplateMessage(

  input: SendWhatsAppTemplateInput

): Promise<SendWhatsAppTemplateResult> {

  let credentials = null



  if (input.storeId && input.ownerId) {

    await storeRepository.assertStoreMember(input.storeId, input.ownerId)

    const store = await storeRepository.findStoreById(input.storeId)

    if (!store) {

      throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')

    }

    if (!isWhatsAppReadyForStore(store)) {

      throw new AppError(503, 'WhatsApp is not configured for this store', 'WHATSAPP_NOT_CONFIGURED')

    }

    credentials = resolveStoreWhatsAppCredentials(store)

  } else if (env.WHATSAPP.ACCESS_TOKEN && env.WHATSAPP.PHONE_NUMBER_ID) {

    credentials = {

      accessToken: env.WHATSAPP.ACCESS_TOKEN,

      phoneNumberId: env.WHATSAPP.PHONE_NUMBER_ID,

      apiVersion: env.WHATSAPP.API_VERSION,

    }

  }



  if (!credentials) {

    throw new AppError(503, 'WhatsApp is not configured on this server', 'WHATSAPP_NOT_CONFIGURED')

  }



  const to = normalizeWhatsAppNumber(input.to)

  const templateName = input.templateName.trim()



  try {

    const result = await sendTemplateMessage({

      to,

      templateName,

      languageCode: input.languageCode,

      credentials,

    })



    return { messages: [{ id: result.metaMessageId }] }

  } catch (err) {

    if (err instanceof AppError) throw err

    const meta = metaErrorMessage(err, 'Failed to send WhatsApp message')

    throw new AppError(400, meta.message, meta.code ?? 'WHATSAPP_SEND_FAILED')

  }

}


