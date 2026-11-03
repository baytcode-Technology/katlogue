import { parseShopPolicies } from '../../../shared/lib/shop-policies.js'
import type { Store } from '../../stores/types/store.types.js'
import {
  collectOrders,
  selectOrdersForScope,
} from './build-order-reply.service.js'
import {
  resolveShopInfoAsk,
  type ParsedCustomerIntent,
} from './parse-customer-intent.service.js'

export type StaffHandoffAction = 'none' | 'warn' | 'policy' | 'wait'

export function staffConnectLine(language: string, scriptStyle?: string): string {
  const lang = language.trim().toLowerCase()
  if (lang === 'malayalam' && scriptStyle === 'malayalam_script') {
    return 'സ്റ്റാഫ് താങ്കളെ ബന്ധപ്പെടും സാർ. ഈ ചാറ്റിൽ കാത്തിരിക്കൂ.'
  }
  if (lang === 'malayalam') {
    return 'Staff ningale connect cheyyum saar. Ee chatil wait cheyyu.'
  }
  return 'Staff will connect you sir. Please wait in this chat.'
}

export function isStaffHandoffIssue(
  intent: ParsedCustomerIntent,
  customerText: string
): boolean {
  if (intent.intent === 'shop_info' && resolveShopInfoAsk(customerText) === 'returns') {
    return true
  }
  if (intent.intent !== 'order_status') return false
  const ask = intent.orderAsk
  return (
    ask === 'refund' ||
    ask === 'cancel' ||
    ask === 'not_mine' ||
    ask === 'delay' ||
    ask === 'why'
  )
}

async function canAnswerFromFacts(input: {
  store: Store
  intent: ParsedCustomerIntent
  customerText: string
  customerPhone?: string | null
  conversationId?: number | null
}): Promise<boolean> {
  const { store, intent } = input
  if (intent.intent === 'shop_info' && resolveShopInfoAsk(input.customerText) === 'returns') {
    const policies = parseShopPolicies(store.shop_policies)
    return (
      policies.return_days != null ||
      policies.exchange_allowed ||
      policies.refund_days_after_cancel != null ||
      Boolean(policies.return_note)
    )
  }

  const ask = intent.orderAsk
  if (ask === 'refund' || ask === 'cancel' || ask === 'not_mine') return false
  if (ask !== 'delay' && ask !== 'why') return false
  const phone = input.customerPhone?.trim()
  if (!phone) return false

  const orders = await collectOrders({
    store,
    customerPhone: phone,
    intent,
    conversationId: input.conversationId ?? null,
  })
  const first = selectOrdersForScope(orders, intent)[0]
  return Boolean(first?.promised_by?.trim() || first?.delay_note?.trim())
}

export async function resolveStaffHandoff(input: {
  store: Store
  intent: ParsedCustomerIntent
  customerText: string
  staffWarnedAt: string | null | undefined
  customerPhone?: string | null
  conversationId?: number | null
}): Promise<StaffHandoffAction> {
  if (!isStaffHandoffIssue(input.intent, input.customerText)) return 'none'
  if (input.staffWarnedAt) return 'wait'
  const canAnswer = await canAnswerFromFacts(input)
  return canAnswer ? 'policy' : 'warn'
}
