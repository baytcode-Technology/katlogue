import { AppError } from '../../../shared/errors/app.error.js'
import { completeImageJson } from '../../../shared/llm/openai.provider.js'

export type PaymentScreenshotRead = {
  isPaymentSuccess: boolean
  amount: number | null
}

const PROMPT = `Look at this image. Reply with JSON only:
{"isPaymentSuccess": true or false, "amount": number or null}
isPaymentSuccess is true only for a UPI, Google Pay, or PhonePe payment success screen.
amount is the paid amount in major units, such as rupees, or null when the amount cannot be read.
Do not guess a product or an amount.`

function asAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.]/g, ''))
    if (Number.isFinite(parsed) && value.trim()) return parsed
  }
  return null
}

export async function readPaymentScreenshot(
  image: Buffer,
  mimeType: string
): Promise<PaymentScreenshotRead | null> {
  try {
    const raw = await completeImageJson({
      systemPrompt: PROMPT,
      userText: 'Read this payment screenshot.',
      image,
      mimeType,
    })
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned) as { isPaymentSuccess?: unknown; amount?: unknown }
    return {
      isPaymentSuccess: parsed.isPaymentSuccess === true,
      amount: asAmount(parsed.amount),
    }
  } catch (err) {
    const message = err instanceof AppError ? err.message : err instanceof Error ? err.message : err
    console.error('[inbox-ai] payment screenshot read failed', message)
    return null
  }
}
