import {
  extractAskedSizes,
  looksLikePlacedOrderAsk,
  matchShopDepartment,
  wantsDeliveryEta,
  wantsReturnPolicy,
} from '../agent/inbox-agent-tools.js'
import {
  BOOK_PHRASE,
  WANT_PHRASE,
  buyQuantity,
  checkoutChoice,
  isQuantityReply,
  lastCheckoutProduct,
  sizeTokens,
} from '../pending-checkout.js'
import {
  extractLastShownProduct,
  extractOpenOffer,
  filterSessionHistory,
} from '../services/conversation-history.service.js'
import {
  isRefuseMessage,
  isShortReplyToOffer,
  type ConversationHistoryLine,
} from '../services/parse-customer-intent.service.js'

export type TurnRoute =
  | { kind: 'book'; quantity: number; payHere: boolean }
  | { kind: 'placed_order' }
  | { kind: 'shop_fact'; ask: 'returns' | 'delivery' }
  | { kind: 'product' }
  | { kind: 'greeting' }

const BARE_HELLO = /^(hi|hello|hey|hai|namaste)\b/i
function namesAnotherDepartment(text: string, shopSells: string[], lastTitle: string | null): boolean {
  const asked = matchShopDepartment(text, shopSells)
  if (!asked) return false
  const shown = lastTitle ? matchShopDepartment(lastTitle, shopSells) : null
  if (!shown) return false
  return asked.toLowerCase() !== shown.toLowerCase()
}

/** Where this message goes. First match wins. The model does not choose. */
export function routeCustomerTurn(input: {
  text: string
  recentMessages: ConversationHistoryLine[]
  shopSells: string[]
}): TurnRoute {
  const text = input.text.trim()
  const recentMessages = filterSessionHistory(input.recentMessages)
  const last = lastCheckoutProduct(recentMessages)
  const lastTitle = extractLastShownProduct(recentMessages)?.title ?? null
  const otherDepartment = namesAnotherDepartment(text, input.shopSells, lastTitle)
  const offer = extractOpenOffer(recentMessages)
  const sizes = extractAskedSizes(text)
  const hasCount = sizeTokens(text).some((token) => /^\d{1,2}$/.test(token) && !sizes.includes(token))
  const sizeOnly = sizes.length > 0 && !hasCount
  const agreedToOffer =
    Boolean(offer) && isShortReplyToOffer(text) && !isRefuseMessage(text) && !sizeOnly
  const sizeOrQuantity = isQuantityReply(text, recentMessages) || (sizes.length > 0 && hasCount)
  const wantThis = WANT_PHRASE.test(text) && !matchShopDepartment(text, input.shopSells)

  if (
    last &&
    !otherDepartment &&
    !wantsDeliveryEta(text) &&
    !looksLikePlacedOrderAsk(text) &&
    (BOOK_PHRASE.test(text) || /\bbook\b/i.test(text) || wantThis || agreedToOffer || sizeOrQuantity)
  ) {
    return {
      kind: 'book',
      quantity: buyQuantity(text),
      payHere: checkoutChoice(text) === 'pay_here',
    }
  }

  if (looksLikePlacedOrderAsk(text)) return { kind: 'placed_order' }
  if (wantsReturnPolicy(text)) return { kind: 'shop_fact', ask: 'returns' }
  if (wantsDeliveryEta(text)) return { kind: 'shop_fact', ask: 'delivery' }
  if (BARE_HELLO.test(text)) return { kind: 'greeting' }
  return { kind: 'product' }
}
