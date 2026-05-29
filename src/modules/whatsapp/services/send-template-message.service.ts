import axios from 'axios'
import { env, isWhatsAppConfigured } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'

type MetaErrorResponse = {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

export type SendWhatsAppTemplateInput = {
  to: string
  templateName: string
  languageCode?: string
}

export type SendWhatsAppTemplateResult = {
  messages: Array<{ id: string }>
}

function metaErrorMessage(
  err: unknown,
  fallback: string
): { message: string; code?: string } {
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
  if (!isWhatsAppConfigured()) {
    throw new AppError(
      503,
      'WhatsApp is not configured on this server',
      'WHATSAPP_NOT_CONFIGURED'
    )
  }

  const token = env.WHATSAPP.ACCESS_TOKEN!
  const phoneNumberId = env.WHATSAPP.PHONE_NUMBER_ID!
  const version = env.WHATSAPP.API_VERSION

  const to = normalizeWhatsAppNumber(input.to)
  const templateName = input.templateName.trim()
  const languageCode = (input.languageCode?.trim() || 'en_US').trim()

  try {
    const { data } = await axios.post<SendWhatsAppTemplateResult>(
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      }
    )

    return data
  } catch (err) {
    const meta = metaErrorMessage(err, 'Failed to send WhatsApp message')
    throw new AppError(400, meta.message, meta.code ?? 'WHATSAPP_SEND_FAILED')
  }
}

