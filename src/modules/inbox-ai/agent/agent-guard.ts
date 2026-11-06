import {
  isHonestNoOrderTalk,
  isHonestOrderTalk,
  isHonestProductClosing,
  isReplyScriptValid,
} from '../services/build-localized-reply.service.js'
import type { ScriptStyle } from '../services/parse-customer-intent.service.js'

const HELPDESK_ENGLISH =
  /\b(how can i assist|what can i help you|let me know if you need|could you please let me know|view and purchase|need any (more )?help|here is what i found|if you have any other questions|you can check it out|feel free to let me know)\b/i

export function isHelpdeskEnglish(reply: string): boolean {
  return HELPDESK_ENGLISH.test(reply)
}

const MANGLISH_CUE =
  /\b(und|undo|undu|unda|illa|aanu|aahn|ithu|ithinte|nokku|vere|njan|enick|sheri|cheyyano|cheyyum|vendath|vehnam|kayyil|shopil|ilekku|swagatham|ethokke|ayack|manasilayilla|avumbol|parayane|kittan|helpline)\b/i

/** Drop markdown. Strip URLs when code is already sending the product card. */
export function sanitizeAgentSpoken(text: string, options?: { stripUrls?: boolean }): string {
  const fromMarkdown = options?.stripUrls
    ? ''
    : '$1'
  let next = text.replace(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/gi, fromMarkdown)
  if (options?.stripUrls) {
    next = next.replace(/https?:\/\/\S+/gi, '')
    next = next.replace(/(?:₹|rs\.?)\s*[\d,]+/gi, '')
  }
  return next
    .replace(/\blink\s+(ithu|here)?\s*:\s*\.?\s*/gi, '')
    .replace(/\b(ee\s+)?linkil koodi nokkam\s*:\s*/gi, '')
    .replace(/\blink\s+aanu\s+ithu\b[.!]*/gi, '')
    .replace(/^[ \t]*-[ \t]*$/gm, '')
    .replace(/:\s*$/gm, '')
    .replace(/[*_#`]+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function spokenLanguageOk(
  reply: string,
  language: string,
  scriptStyle?: ScriptStyle
): boolean {
  if (language !== 'Malayalam' || scriptStyle === 'malayalam_script') return true
  if (HELPDESK_ENGLISH.test(reply)) return false
  return MANGLISH_CUE.test(reply)
}

/** Spoken text may only repeat links, prices, and order numbers that tools or the chat already returned. */
export function replyUsesOnlyToolFacts(reply: string, allowed: string): boolean {
  const haystack = allowed.toLowerCase()
  const urls = reply.match(/https?:\/\/[^\s)]+/gi) ?? []
  for (const raw of urls) {
    const url = raw.replace(/[.,]+$/g, '')
    const bare = url.split('?')[0]?.toLowerCase() ?? url.toLowerCase()
    if (!haystack.includes(url.toLowerCase()) && !haystack.includes(bare)) return false
  }

  const prices = reply.match(/(?:₹|rs\.?)\s*[\d,]+/gi) ?? []
  for (const price of prices) {
    const digits = price.replace(/[^\d]/g, '')
    if (digits && !allowed.replace(/[^\d]/g, ' ').includes(digits) && !allowed.includes(digits)) {
      return false
    }
  }

  const orders = reply.match(/\b[A-Z]{3}\d{2}-\d+\b/g) ?? []
  for (const number of orders) {
    if (!allowed.toUpperCase().includes(number)) return false
  }

  return true
}

export function isAgentReplyHonest(input: {
  reply: string
  allowed: string
  language: string
  scriptStyle?: ScriptStyle
  showedProduct: boolean
  lookedUpOrders: boolean
}): boolean {
  const reply = input.reply.trim()
  if (!reply) return false
  if (!spokenLanguageOk(reply, input.language, input.scriptStyle)) return false
  if (!replyUsesOnlyToolFacts(reply, input.allowed)) return false
  if (!isReplyScriptValid(reply, input.language, input.scriptStyle)) return false
  if (input.lookedUpOrders) {
    return isHonestOrderTalk(reply, 'order_followup', input.allowed)
  }
  if (!isHonestProductClosing(reply)) return false
  if (input.showedProduct) {
    return isHonestNoOrderTalk(reply, 'product_lines', {})
  }
  return isHonestNoOrderTalk(reply, 'acknowledgement', {})
}
