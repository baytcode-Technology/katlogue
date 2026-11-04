import {
  isHonestNoOrderTalk,
  isHonestOrderTalk,
  isHonestProductClosing,
  isReplyScriptValid,
} from '../services/build-localized-reply.service.js'
import type { ScriptStyle } from '../services/parse-customer-intent.service.js'

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
  if (!replyUsesOnlyToolFacts(reply, input.allowed)) return false
  if (!isReplyScriptValid(reply, input.language, input.scriptStyle)) return false
  if (!isHonestProductClosing(reply)) return false
  if (input.lookedUpOrders) {
    return isHonestOrderTalk(reply, 'order_followup', input.allowed)
  }
  if (input.showedProduct) {
    return isHonestNoOrderTalk(reply, 'product_lines', {})
  }
  return isHonestNoOrderTalk(reply, 'acknowledgement', {})
}
