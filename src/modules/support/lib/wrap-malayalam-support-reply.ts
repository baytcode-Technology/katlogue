import {
  hasMalayalamScript,
  hasTamilScript,
  hasDevanagariScript,
  isEnglishSupportBodyValid,
} from '../../../shared/lib/detect-language-script.js'
import { FALLBACK_MESSAGE } from '../../../shared/llm/index.js'

export const SUPPORT_MALAYALAM_LEAD = 'ശരി സാർ, ഇങ്ങനെ ചെയ്യാം.'

export const SUPPORT_ENGLISH_STEPS_ONLY =
  'Write the how-to in English only. Numbered steps. Exact button labels. Answer only the latest question. No Malayalam, Tamil, or Hindi. Do not mention language skills.'

export const SUPPORT_MANGLISH_RETRY =
  'Write in Manglish only — Malayalam words in English letters. No Malayalam script, Tamil, or Hindi.'

const SHORT_ENGLISH_FALLBACK =
  'Tap Talk with us if you need a person from AiShopy.'

export function wrapMalayalamScriptSupportReply(englishBody: string): string {
  const body = englishBody.trim()
  if (!body) return SUPPORT_MALAYALAM_LEAD
  if (body.startsWith(SUPPORT_MALAYALAM_LEAD)) return body
  return `${SUPPORT_MALAYALAM_LEAD}\n\n${body}`
}

export function resolveEnglishHowToBody(first: string, retry?: string | null): string {
  if (isUsableEnglishHowTo(first)) return first.trim()
  const second = retry?.trim() ?? ''
  if (isUsableEnglishHowTo(second)) return second
  return SHORT_ENGLISH_FALLBACK
}

export function isManglishSupportBodyValid(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (hasTamilScript(trimmed) || hasDevanagariScript(trimmed)) return false
  if (hasMalayalamScript(trimmed)) return false
  return true
}

function isUsableEnglishHowTo(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed === FALLBACK_MESSAGE || trimmed.includes('could not reach our AI')) return false
  return isEnglishSupportBodyValid(trimmed)
}
