import { formatMoney } from '../../../shared/utils/storefront.js'
import {
  formatShopPolicyCustomerCopyForAsk,
  parseShopPolicies,
  type ShopPolicyAsk,
} from '../../../shared/lib/shop-policies.js'
import { parseStoredPaymentConfig } from '../../payments/lib/payment-config.js'
import type { Store } from '../../stores/types/store.types.js'
import { applyChatSrcToUrl } from '../lib/chat-src.js'
import type { InboxAiChannel } from '../services/conversation-history.service.js'
import {
  filterMatchesByScore,
  findBySku,
  getStoreCatalogSummary,
  getStoreHomeUrl,
  matchWithVariant,
  searchCatalog,
  type CatalogMatch,
  type StoreCatalogSummary,
  type VariantBoard,
} from '../services/catalog-search.service.js'
import {
  collectOrders,
  formatOrderFactCard,
  orderHasCourierDetails,
  selectOrdersForScope,
} from '../services/build-order-reply.service.js'
import {
  extractOrderNumber,
  extractOrderNumberHint,
  type OrderScope,
  type ParsedCustomerIntent,
} from '../services/parse-customer-intent.service.js'
import type { LlmToolDefinition } from '../../../shared/llm/types.js'

export type AgentTurnState = {
  shown: CatalogMatch | null
  also: CatalogMatch[]
  found: CatalogMatch[]
  lastQuery: string
  facts: string[]
  helpline: boolean
  lookedUpOrders: boolean
}

export type InboxAgentToolDeps = {
  searchCatalog?: typeof searchCatalog
  findBySku?: typeof findBySku
  collectOrders?: typeof collectOrders
  getStoreCatalogSummary?: typeof getStoreCatalogSummary
}

export const INBOX_AGENT_TOOLS: LlmToolDefinition[] = [
  {
    name: 'search_products',
    description:
      'Search THIS shop catalog. Pass identifying words (style, fabric, brand, model, type). Keep "check shirt". Never put colour, color, other, or vere in the query. Do not search again for discount, quantity, book, or other colour/size of the last card.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product words to search, e.g. check shirt' },
        color: { type: 'string', description: 'Colour if they named one, else omit' },
        size: { type: 'string', description: 'Size if they named one, else omit' },
        optionValue: {
          type: 'string',
          description: 'Any variant option they named (RAM, colour, storage), else omit',
        },
        category: { type: 'string', description: 'Shop department only if they named one' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product_by_sku',
    description: 'Look up one product by the exact SKU the customer typed.',
    parameters: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'SKU exactly as typed' },
      },
      required: ['sku'],
    },
  },
  {
    name: 'show_product',
    description:
      'Send this product card (photo, price, link). Call only with a productId returned by search_products or get_product_by_sku in this turn.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'integer', description: 'productId from a tool result' },
        variantId: { type: 'integer', description: 'variantId from that result, or omit' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'get_my_orders',
    description:
      'Look up orders for the WhatsApp number on this chat only. Use only if they asked about an order they already placed (order number, tracking, where is my order). Do not use for "if I order today when will it arrive", booking, or a discount.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'latest, all, specific, or product',
        },
        orderNumber: { type: 'string', description: 'Full order number if they gave one' },
        productHint: {
          type: 'string',
          description: 'Product identity if they named one, e.g. check shirt',
        },
      },
      required: ['scope'],
    },
  },
  {
    name: 'get_shop_info',
    description: 'Shop location, hours, delivery, payment, returns, or offers. Facts only.',
    parameters: {
      type: 'object',
      properties: {
        ask: {
          type: 'string',
          description: 'location, hours, delivery, payment, returns, offers, or general',
        },
      },
      required: ['ask'],
    },
  },
  {
    name: 'connect_helpline',
    description:
      'Customer helpline will contact them. Use only for cancel, refund, address change, or not-my-order. Do not use for a missing delivery date.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'cancel, refund, address, or not_mine' },
      },
      required: ['reason'],
    },
  },
]

const SEARCH_QUERY_FILLER = new Set([
  'colour',
  'color',
  'colours',
  'colors',
  'niram',
  'nirangal',
  'other',
  'others',
  'another',
  'different',
  'more',
  'any',
  'vere',
  'ethelum',
  'ethra',
  'okke',
  'ellaa',
  'ella',
])

function departmentTokens(dept: string): string[] {
  return dept.toLowerCase().replace(/-/g, ' ').split(' ').filter(Boolean)
}

function namedSeparateDepartments(query: string): boolean {
  return /\b(and|or|um)\b/i.test(query)
}

export function matchAllShopDepartments(query: string, shopSells: string[]): string[] {
  const hits: string[] = []
  for (const dept of shopSells) {
    if (matchShopDepartment(query, [dept]) && !hits.includes(dept)) hits.push(dept)
  }
  if (hits.length < 2 || namedSeparateDepartments(query)) return hits
  return hits.filter((dept) => {
    const mine = departmentTokens(dept)
    const coveredByLonger = hits.some((other) => {
      if (other === dept) return false
      const theirs = departmentTokens(other)
      if (theirs.length <= mine.length) return false
      return mine.every((part) =>
        theirs.some((token) => token === part || token.replace(/s$/i, '') === part.replace(/s$/i, ''))
      )
    })
    return !coveredByLonger
  })
}

export function matchShopDepartment(query: string, shopSells: string[]): string | null {
  const raw = query.trim().toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ')
  if (!raw || shopSells.length === 0) return null

  const normalize = (value: string) =>
    value.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  const exact = shopSells.find((dept) => normalize(dept) === raw)
  if (exact) return exact

  const tokens = raw.split(' ').filter((token) => token.length > 0)
  const hits: { dept: string; weight: number }[] = []
  for (const dept of shopSells) {
    const deptTokens = normalize(dept).split(' ').filter(Boolean)
    const tokenEq = (a: string, b: string) => a === b || a.replace(/s$/i, '') === b.replace(/s$/i, '')
    if (deptTokens.length === 1) {
      if (tokens.some((token) => tokenEq(token, deptTokens[0]))) {
        hits.push({ dept, weight: deptTokens[0].length })
      }
      continue
    }
    if (deptTokens.every((part) => tokens.some((token) => tokenEq(token, part)))) {
      hits.push({ dept, weight: deptTokens.join(' ').length + 10 })
    }
  }
  if (hits.length === 0) return null
  hits.sort((a, b) => b.weight - a.weight)
  return hits[0].dept
}

export function cleanSearchQuery(query: string): string {
  const raw = query.trim()
  if (!raw) return raw
  const kept = raw.split(/\s+/).filter((token) => !SEARCH_QUERY_FILLER.has(token.toLowerCase()))
  return kept.length > 0 ? kept.join(' ') : raw
}

const FOLLOW_UP_TOKENS = new Set([
  'piece',
  'pieces',
  'price',
  'discount',
  'offer',
  'offers',
  'book',
  'booking',
  'order',
  'link',
  'deliver',
  'delivery',
  'when',
  'today',
  'combo',
  'cheap',
  'cheaper',
  'quantity',
  'qty',
  'pay',
  'checkout',
  'confirm',
  'how',
  'engan',
  'engana',
  'korayuvo',
  'kurayuvo',
  'orumich',
  'available',
  'aahna',
  'aahn',
  'aahno',
  'ahno',
  'cheytha',
  'cheyyamo',
  'cheyyum',
  'eppoyathekk',
  'eppoy',
  'eppol',
  'aavum',
  'avum',
  'vendath',
  'veenda',
  'ith',
  'ithu',
  'ithinte',
  'mathi',
  'undo',
  'undu',
  'onda',
  'size',
  'sizes',
  'alle',
  'model',
  'models',
  'enick',
  'njan',
  'ollo',
  'oru',
  'appo',
  'pole',
  'mathre',
  'aah',
  'ennam',
  'eduthal',
  'vallom',
  'photo',
  'photos',
  'image',
  'images',
  'ayack',
  'ayakku',
])

export function wantsOptionPhotos(text: string): boolean {
  const send = /\b(ayack|ayakku|ayackavo|ayakkavo|send)\b/i.test(text)
  const photo = /\b(photo|photos|images?|picture|pic)\b/i.test(text)
  const each =
    /\b(oro|nteyum|ntheyum)\b/i.test(text) ||
    /\b\d+nteyum\b/i.test(text) ||
    /\d+\s*(photos?|colours?|colors?)/i.test(text)
  if (photo && (each || /\b(ella|ellaa|okke|all|every)\b/i.test(text))) return true
  return send && each
}

export function wantsWholeStoreShare(text: string): boolean {
  return /\b(share|details|catalog).{0,50}\b(store|shop)\b|\b(store|shop).{0,50}\b(all product|catalog|all details|all product details)\b|\bshare.{0,40}all product/i.test(
    text
  )
}

export function queryIdentityTokens(text: string, shopSells: string[]): string[] {
  return identityTokens(text, shopSells)
}

export function wantsOtherModels(text: string): boolean {
  return /\b((okke|ellaa|ella)\s+(ayack|ayakku|ayakkavo|ayakkuvo|share)|model(?:s)?\s+ella|ella\s+share|enthokke.{0,40}(share|details)|details\s+share|all models|every model|all that have|send (all|every)|(vere|other|another)\s+models?)\b/i.test(
    text
  )
}

export function wantsReturnPolicy(text: string): boolean {
  return /\b(return\s+policy|can i return|return chey\w*|return parumo|exchange|refund policy)\b/i.test(
    text
  )
}

export function wantsCheckout(text: string): boolean {
  return /\b(order cheyyam|order cheyam|order cheyyan|how to order|book it|i want to order)\b/i.test(
    text
  )
}

export function wantsDeliveryEta(text: string): boolean {
  return /\b((eathra|ethra).{0,24}(day|days|kitt)|how many days|avum kitt|eppo kitt|delivery (days|time|take))\b/i.test(
    text
  )
}

export function wantsAlsoList(
  text: string,
  lastTitle: string | null,
  shopSells: string[]
): boolean {
  if (wantsOptionPhotos(text) || wantsWholeStoreShare(text)) return false
  if (wantsOtherModels(text)) return true
  if (matchAllShopDepartments(text, shopSells).length >= 2) return true
  if (!lastTitle?.trim()) return false
  if (stayOnLastProduct(text, lastTitle, shopSells)) return false
  const qDept = matchShopDepartment(text, shopSells)
  const lastDept = matchShopDepartment(lastTitle, shopSells)
  return Boolean(qDept && lastDept && qDept.toLowerCase() === lastDept.toLowerCase())
}

export function extraHitsIdentity(name: string, tokens: string[]): boolean {
  const hay = name.toLowerCase()
  return tokens.some((token) => {
    if (hay.includes(token)) return true
    if (token.length > 3 && hay.includes(token.slice(0, -1))) return true
    return false
  })
}

export function optionPhotoKey(text: string, board: VariantBoard | null | undefined): string | null {
  const named = askedOptionKey(text, board)
  if (named) return named
  if (!board) return null
  return (
    board.optionKeys.find((key) => (board.optionValues[key]?.length ?? 0) > 1) ?? null
  )
}

export function extraOptionVariants(
  match: CatalogMatch,
  key: string,
  storeSlug: string
): CatalogMatch[] {
  const current = String(match.variant?.options?.[key] ?? '').toLowerCase()
  const seen = new Set<string>()
  const extras: CatalogMatch[] = []
  for (const variant of match.activeVariants ?? []) {
    const value = String(variant.options?.[key] ?? '').trim()
    if (!value) continue
    const norm = value.toLowerCase()
    if (norm === current || seen.has(norm)) continue
    seen.add(norm)
    extras.push(matchWithVariant(storeSlug, match, variant))
    if (extras.length >= 4) break
  }
  return extras
}

export function askedOptionKey(text: string, board: VariantBoard | null | undefined): string | null {
  if (!board?.optionKeys.length) return null
  const raw = text.toLowerCase()
  for (const key of board.optionKeys) {
    if (key && raw.includes(key.toLowerCase())) return key
  }
  if (/\b(colour|color|colours|colors|niram)\b/i.test(text)) {
    return board.optionKeys.find((key) => /colou?r/i.test(key)) ?? null
  }
  if (/\bsize\b/i.test(text)) {
    return board.optionKeys.find((key) => /size/i.test(key)) ?? null
  }
  return null
}

export function extractAskedOptionValue(text: string, board: VariantBoard | null | undefined): string | null {
  if (!board) return null
  const raw = text.toLowerCase()
  for (const values of Object.values(board.optionValues)) {
    const hit = values.find((value) => {
      const token = value.toLowerCase()
      return token.length > 1 && raw.includes(token)
    })
    if (hit) return hit
  }
  return extractAskedSize(text)
}

export function optionBoardLine(
  key: string,
  values: string[],
  language: string,
  scriptStyle?: string
): string {
  const list = values.join(', ')
  if (language === 'Malayalam' && scriptStyle === 'malayalam_script') {
    return `${key}: ${list}`
  }
  if (language === 'Malayalam') {
    return `Yes sir, ${key} ${list} und.`
  }
  return `Yes, this one has ${key}: ${list}.`
}

export function deniesOtherOptions(reply: string): boolean {
  return /\b(mathram|only this|only one|vere colour illa|no other)\b/i.test(reply)
}

export function extractAskedSize(text: string): string | null {
  const sizes = extractAskedSizes(text)
  return sizes[sizes.length - 1] ?? null
}

export function extractAskedSizes(text: string): string[] {
  if (!/\b(size|sz)\b/i.test(text)) return []
  const nums = [...text.matchAll(/\b(\d{1,3})\b/g)]
    .map((match) => match[1])
    .filter((num) => !(num === '1' && /\b1\s+mathi\b/i.test(text)))
  if (nums.length > 0) return nums
  const labeled = text.match(/\b(?:size|sz)\s*[:#-]?\s*(xxxl|xxl|xl|xxs|xs|s|m|l)\b/i)
  return labeled?.[1] ? [labeled[1].toUpperCase()] : []
}

const VALUE_ALIASES: Record<string, string[]> = {
  beige: ['cream', 'beige'],
  white: ['off white', 'off-white', 'offwhite'],
  grey: ['gray', 'grey'],
  gray: ['gray', 'grey'],
}

export function resolveBoardValue(text: string, values: string[]): string | null {
  const raw = text.toLowerCase()
  const direct = values.find((value) => value.length > 1 && raw.includes(value.toLowerCase()))
  if (direct) return direct
  for (const value of values) {
    const words = VALUE_ALIASES[value.toLowerCase()] ?? []
    if (words.some((word) => raw.includes(word))) return value
  }
  return null
}

export function askedBoardConstraints(
  text: string,
  board: VariantBoard | null | undefined
): {
  hits: Array<{ key: string; value: string }>
  missing: Array<{ key: string; asked: string }>
} {
  if (!board) return { hits: [], missing: [] }
  const hits: Array<{ key: string; value: string }> = []
  const missing: Array<{ key: string; asked: string }> = []
  for (const key of board.optionKeys) {
    const values = board.optionValues[key] ?? []
    if (/size/i.test(key)) {
      const asked = extractAskedSizes(text)
      const onBoard = asked.filter((size) =>
        values.some((value) => value.toLowerCase() === size.toLowerCase())
      )
      const off = asked.filter(
        (size) => !values.some((value) => value.toLowerCase() === size.toLowerCase())
      )
      if (onBoard.length > 0) hits.push({ key, value: onBoard[onBoard.length - 1] })
      if (off.length > 0) missing.push({ key, asked: off.join(', ') })
      continue
    }
    const resolved = resolveBoardValue(text, values)
    if (resolved) hits.push({ key, value: resolved })
  }
  return { hits, missing }
}

export function missingOptionLine(
  key: string,
  asked: string,
  values: string[],
  language: string
): string {
  const list = values.join(', ')
  if (language === 'Malayalam') return `${asked} ee itemil illa sir. ${key} ${list} und.`
  return `${asked} is not on this one. ${key}: ${list}.`
}

function optionValue(match: CatalogMatch, key: string): string {
  return String(match.variant?.options?.[key] ?? '').trim()
}

function sameOption(match: CatalogMatch, key: string, value: string): boolean {
  return optionValue(match, key).toLowerCase() === value.toLowerCase()
}

export function variantRowsFor(storeSlug: string, match: CatalogMatch): CatalogMatch[] {
  const variants = match.activeVariants ?? []
  if (variants.length === 0) return [match]
  return variants.map((variant) => {
    const row = matchWithVariant(storeSlug, match, variant)
    row.activeVariants = match.activeVariants
    row.variantBoard = match.variantBoard
    return row
  })
}

export function pickVariantForAsk(
  storeSlug: string,
  match: CatalogMatch,
  text: string,
  stay: boolean
): CatalogMatch {
  const rows = variantRowsFor(storeSlug, match)
  const board = match.variantBoard
  if (!board) return match
  const { hits, missing } = askedBoardConstraints(text, board)
  if (missing.length > 0) return match
  const wanted = hits.filter((hit) => !sameOption(match, hit.key, hit.value))
  if (wanted.length > 0) {
    const keepsRest = (row: CatalogMatch) =>
      row.inStock !== false &&
      wanted.every((ask) => sameOption(row, ask.key, ask.value)) &&
      board.optionKeys.every((key) => {
        if (wanted.some((ask) => ask.key === key)) return true
        const current = optionValue(match, key)
        return !current || sameOption(row, key, current)
      })
    const hit =
      rows.find(keepsRest) ??
      rows.find(
        (row) =>
          wanted.every((ask) => sameOption(row, ask.key, ask.value)) && row.inStock !== false
      )
    if (hit) return hit
  }
  const otherKey = askedOptionKey(text, board)
  const wantsAnother =
    stay &&
    Boolean(otherKey) &&
    /\b(vere|other|another|vallom|alle)\b/i.test(text) &&
    wanted.length === 0
  if (wantsAnother && otherKey) {
    const current = optionValue(match, otherKey).toLowerCase()
    const other = rows.find((row) => {
      const value = optionValue(row, otherKey).toLowerCase()
      return value && value !== current && row.inStock !== false
    })
    if (other) return other
  }
  return match
}

const SPOKEN_COLOUR_WORDS = [
  'black',
  'white',
  'beige',
  'cream',
  'grey',
  'gray',
  'blue',
  'green',
  'red',
  'yellow',
  'maroon',
  'purple',
  'brown',
  'pink',
  'navy',
]

function aliasOf(word: string, value: string): boolean {
  const left = word.toLowerCase()
  const right = value.toLowerCase()
  if (left === right || right.includes(left) || left.includes(right)) return true
  const words = VALUE_ALIASES[right] ?? VALUE_ALIASES[left] ?? []
  return words.some((alias) => alias === left || alias === right)
}

export function spokenConflictsWithVariant(spoken: string, match: CatalogMatch): boolean {
  const board = match.variantBoard
  if (!board) return false
  const text = spoken.toLowerCase()
  const options = match.variant?.options ?? {}
  for (const [key, values] of Object.entries(board.optionValues)) {
    const shown = String(options[key] ?? '').toLowerCase()
    for (const value of values) {
      if (value.length <= 1 || !text.includes(value.toLowerCase()) || value.toLowerCase() === shown) {
        continue
      }
      const mentioned = values.filter((item) => text.includes(item.toLowerCase()))
      if (mentioned.length > 1) continue
      return true
    }
    if (/size/i.test(key)) {
      for (const num of text.matchAll(/\b(\d{1,3})\b/g)) {
        if (num[1] === '1' && /\b1\s+mathi\b/i.test(text)) continue
        const onBoard = values.some((value) => value.toLowerCase() === num[1])
        if (onBoard && num[1] !== shown) return true
        if (!onBoard && values.length > 0 && num[1] !== shown && (/\bsize\b/i.test(text) || num[1].length >= 2)) {
          return true
        }
      }
    }
  }
  const shownValues = Object.values(options).map((value) => String(value))
  const mentionedBoard = Object.values(board.optionValues)
    .flat()
    .filter((value) => value.length > 1 && text.includes(value.toLowerCase()))
  if (mentionedBoard.length > 1) return false
  return SPOKEN_COLOUR_WORDS.some((word) => {
    if (!text.includes(word)) return false
    if (shownValues.some((value) => aliasOf(word, value))) return false
    const insideListedValue = Object.values(board.optionValues)
      .flat()
      .some((value) => {
      const lower = value.toLowerCase()
      return lower !== word && lower.includes(word) && text.includes(lower)
    })
    return !insideListedValue
  })
}

export function boardSpokenOverride(
  text: string,
  spoken: string,
  match: CatalogMatch | null,
  language: string
): string | null {
  if (!match?.variantBoard) return null
  const { missing } = askedBoardConstraints(text, match.variantBoard)
  if (missing.length > 0) {
    return missing
      .map((row) =>
        missingOptionLine(
          row.key,
          row.asked,
          match.variantBoard?.optionValues[row.key] ?? [],
          language
        )
      )
      .join(' ')
  }
  if (!spokenConflictsWithVariant(spoken, match)) return null
  const parts = Object.entries(match.variant?.options ?? {}).map(([key, value]) => `${key} ${value}`)
  if (parts.length === 0) return null
  if (language === 'Malayalam') return `Yes sir, ithu ${parts.join(', ')} aanu.`
  return `Yes, this one is ${parts.join(', ')}.`
}

function isFollowUpToken(token: string): boolean {
  return FOLLOW_UP_TOKENS.has(token) || /^\d+$/.test(token)
}

function identityTokens(text: string, shopSells: string[]): string[] {
  return cleanSearchQuery(text)
    .toLowerCase()
    .split(/\s+/)
    .filter(
      (token) =>
        token.length > 2 &&
        !SEARCH_QUERY_FILLER.has(token) &&
        !isFollowUpToken(token) &&
        !matchShopDepartment(token, shopSells)
    )
}

/** Same product until they name a new type or a new identity word. */
export function stayOnLastProduct(
  query: string,
  lastTitle: string | null,
  shopSells: string[]
): boolean {
  if (!lastTitle?.trim()) return false
  if (wantsOptionPhotos(query)) return true
  if (wantsWholeStoreShare(query)) return false
  if (wantsOtherModels(query)) return false
  const cleaned = cleanSearchQuery(query)
  const qDept = matchShopDepartment(cleaned, shopSells)
  const lastDept = matchShopDepartment(lastTitle, shopSells)
  if (qDept && lastDept && qDept.toLowerCase() !== lastDept.toLowerCase()) return false

  const lastId = identityTokens(lastTitle, shopSells)
  const qId = identityTokens(cleaned, shopSells)
  if (lastId.length > 0 && qId.some((token) => lastId.includes(token))) return true

  const qTokens = cleaned
    .toLowerCase()
    .split(/\s+/)
    .filter(
      (token) =>
        token.length > 2 && !SEARCH_QUERY_FILLER.has(token) && !isFollowUpToken(token)
    )
  if (qTokens.length === 0) return true
  if (qDept && lastDept && qDept.toLowerCase() === lastDept.toLowerCase() && qId.length === 0) {
    return false
  }
  if (
    /\b(ithinte|vere|other|another)\b/i.test(query) &&
    !(qDept && lastDept && qDept.toLowerCase() !== lastDept.toLowerCase())
  ) {
    return qId.every((token) => lastId.includes(token) || token.length <= 4)
  }
  return qTokens.every((token) => lastTitle.toLowerCase().includes(token))
}

export function looksLikePlacedOrderAsk(text: string): boolean {
  if (wantsReturnPolicy(text)) return false
  if (extractOrderNumber(text) || extractOrderNumberHint(text)) return true
  if (/\b(if i order|njan order|book cheytha)\b/i.test(text)) return false
  const prePay =
    wantsCheckout(text) ||
    (wantsDeliveryEta(text) && !/\b(my|ente|last|ella|all|history|status|ship|tracking)\b/i.test(text))
  if (prePay && !/\b(my order|ente.{0,24}order|last order|order history)\b/i.test(text)) {
    return false
  }
  return /\b(my order|order status|tracking|where is my.{0,40}\border|ente.{0,24}order|order evide|last order|all (my )?orders|ella order|order (history|details)|order history|ship avumbol|status please|^status\b|my order history)\b/i.test(
    text
  )
}

function argString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value.trim() : ''
}

function argId(args: Record<string, unknown>, key: string): number | null {
  const value = args[key]
  const id = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function matchKey(match: CatalogMatch): string {
  return `${match.product.id}:${match.variant?.id ?? 0}`
}

function publicProduct(
  match: CatalogMatch,
  currency: string,
  channel: InboxAiChannel,
  conversationId: number | null
) {
  const url = applyChatSrcToUrl(match.url, channel, conversationId)
  const board = match.variantBoard
  return {
    productId: match.product.id,
    variantId: match.variant?.id ?? null,
    name: match.product.name,
    variantName: match.variant?.name ?? null,
    options: match.variant?.options ?? null,
    optionKeys: board?.optionKeys ?? [],
    optionValues: board?.optionValues ?? {},
    variants: board?.variants ?? [],
    price: formatMoney(match.price, currency),
    inStock: match.inStock !== false,
    url,
    category: match.categoryName ?? null,
  }
}

function orderIntent(scope: OrderScope, orderNumber: string, productHint: string): ParsedCustomerIntent {
  return {
    intent: 'order_status',
    customerLanguage: 'English',
    scriptStyle: 'latin',
    requestedItem: productHint || null,
    searchQuery: '',
    color: null,
    size: null,
    sku: null,
    categoryName: null,
    wantsImage: false,
    orderNumber: orderNumber || null,
    orderNumberHint: null,
    orderProductHint: productHint || null,
    orderScope: scope,
    orderAsk: 'full',
    typedPhone: null,
    sessionTopic: 'order',
    missingWhy: null,
    alternativeCategories: [],
    rejectsLastShown: false,
    replyToLastQuestion: null,
  }
}

function paymentFacts(store: Store): string {
  const payments = parseStoredPaymentConfig(store.payment_config)
  const cod = payments.cod?.enabled === false ? 'not enabled' : 'available'
  const upi = payments.upi?.enabled && payments.upi?.vpa ? 'available at checkout' : 'not enabled'
  const cards = payments.razorpay?.enabled ? 'available at checkout' : 'not enabled'
  return [`COD: ${cod}`, `UPI / Google Pay: ${upi}`, `Cards: ${cards}`].join('\n')
}

export function createInboxAgentTools(input: {
  store: Store
  channel: InboxAiChannel
  customerPhone: string | null
  conversationId: number | null
  shopSells?: string[]
  lastShownTitle?: string | null
  customerText?: string
  deps?: InboxAgentToolDeps
}) {
  const search = input.deps?.searchCatalog ?? searchCatalog
  const skuLookup = input.deps?.findBySku ?? findBySku
  const origin = getStoreHomeUrl(input.store)
  const orders = input.deps?.collectOrders ?? collectOrders
  const summaryFn = input.deps?.getStoreCatalogSummary ?? getStoreCatalogSummary
  const shopSells = input.shopSells ?? []
  const lastShownTitle = input.lastShownTitle?.trim() ?? ''
  const customerText = input.customerText ?? ''
  const cache = new Map<string, CatalogMatch>()
  const state: AgentTurnState = {
    shown: null,
    also: [],
    found: [],
    lastQuery: '',
    facts: [],
    helpline: false,
    lookedUpOrders: false,
  }

  function stayingOnLast(): boolean {
    const last = lastShownTitle || null
    return (
      stayOnLastProduct(customerText, last, shopSells) ||
      stayOnLastProduct(state.lastQuery, last, shopSells)
    )
  }

  function lastProductRows(): CatalogMatch[] {
    if (!lastShownTitle) return []
    const want = lastShownTitle.toLowerCase()
    const rows = [
      ...cache.values(),
      ...state.found,
    ].filter((row) => row.product.name.toLowerCase() === want)
    return rows.filter(
      (row, index, all) =>
        all.findIndex((item) => matchKey(item) === matchKey(row)) === index
    )
  }

  function pickStayMatch(fallback: CatalogMatch | null): CatalogMatch | null {
    const base = fallback ?? lastProductRows()[0] ?? null
    if (!base) return null
    return pickVariantForAsk(input.store.slug, base, customerText, true)
  }

  function markShown(match: CatalogMatch, stay = false): void {
    state.shown = match
    state.also = stay
      ? []
      : [...cache.values()].filter(
          (row, index, all) =>
            row.product.id !== match.product.id &&
            all.findIndex((item) => item.product.id === row.product.id) === index
        )
    state.facts.push(`${match.product.name} ${formatMoney(match.price, input.store.currency)} ${match.url}`)
    if (match.variantBoard) state.facts.push(JSON.stringify(match.variantBoard))
  }

  function remember(matches: CatalogMatch[]): void {
    for (const match of matches) {
      const linked = {
        ...match,
        url: applyChatSrcToUrl(match.url, input.channel, input.conversationId),
      }
      cache.set(matchKey(linked), linked)
      cache.set(`${linked.product.id}:0`, linked)
      for (const variant of match.activeVariants ?? []) {
        if (variant.id === match.variant?.id) continue
        const sibling = matchWithVariant(input.store.slug, linked, variant)
        sibling.url = applyChatSrcToUrl(sibling.url, input.channel, input.conversationId)
        cache.set(matchKey(sibling), sibling)
      }
    }
  }

  async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (name === 'search_products') {
      let query = cleanSearchQuery(argString(args, 'query'))
      const stay =
        Boolean(lastShownTitle) &&
        (stayOnLastProduct(customerText, lastShownTitle, shopSells) ||
          stayOnLastProduct(query, lastShownTitle, shopSells))
      if (stay && lastShownTitle) query = lastShownTitle
      else if (wantsOtherModels(customerText) && lastShownTitle) {
        query = matchShopDepartment(lastShownTitle, shopSells) || lastShownTitle
      }
      state.lastQuery = query
      const fromModel = argString(args, 'category')
      const namedDepts = matchAllShopDepartments(customerText, shopSells)
      const categoryName =
        matchShopDepartment(fromModel, shopSells) ??
        matchShopDepartment(query, shopSells) ??
        (fromModel || null)
      const size = argString(args, 'size') || extractAskedSize(customerText) || null
      const color = argString(args, 'color') || null
      const optionValue = argString(args, 'optionValue') || null
      const searchOne = (q: string, category: string | null) =>
        search(
          input.store.id,
          input.store.slug,
          input.store.currency,
          {
            query: q,
            color,
            size,
            optionValue,
            categoryName: category,
          },
          origin
        )
      let matches: CatalogMatch[]
      if (!stay && namedDepts.length > 1) {
        const bags = await Promise.all(namedDepts.map((dept) => searchOne(dept, dept)))
        const merged: CatalogMatch[] = []
        for (const bag of bags) {
          for (const row of bag) {
            if (!merged.some((item) => item.product.id === row.product.id)) merged.push(row)
          }
        }
        matches = filterMatchesByScore(merged)
      } else {
        matches = filterMatchesByScore(await searchOne(query, categoryName))
      }
      if (stay && lastShownTitle) {
        const same = matches.filter(
          (row) => row.product.name.toLowerCase() === lastShownTitle.toLowerCase()
        )
        if (same.length === 0) {
          const retry = filterMatchesByScore(
            await search(
              input.store.id,
              input.store.slug,
              input.store.currency,
              {
                query: lastShownTitle,
                color: null,
                size: null,
                categoryName: matchShopDepartment(lastShownTitle, shopSells),
              },
              origin
            )
          )
          matches = [...matches, ...retry]
        }
      }
      remember(matches)
      state.found = matches
      const shownRows =
        stay && lastShownTitle
          ? matches.filter(
              (row) => row.product.name.toLowerCase() === lastShownTitle.toLowerCase()
            )
          : matches
      const rows = (shownRows.length > 0 ? shownRows : matches).map((match) =>
        publicProduct(match, input.store.currency, input.channel, input.conversationId)
      )
      state.facts.push(JSON.stringify(rows))
      if (rows.length > 0) return { products: rows }

      let summary: StoreCatalogSummary = { productNames: [], categoryNames: shopSells }
      try {
        summary = await summaryFn(input.store.id)
      } catch {
        summary = { productNames: [], categoryNames: shopSells }
      }
      const closeNames = [...new Set([...summary.categoryNames, ...summary.productNames])].slice(
        0,
        12
      )
      const empty = {
        products: [] as typeof rows,
        departments: shopSells.length > 0 ? shopSells : summary.categoryNames,
        closeNames,
      }
      state.facts.push(JSON.stringify(empty))
      return empty
    }

    if (name === 'get_product_by_sku') {
      const match = await skuLookup(
        input.store.id,
        input.store.slug,
        input.store.currency,
        argString(args, 'sku'),
        origin
      )
      if (!match) {
        state.facts.push('sku: none')
        return { products: [] }
      }
      remember([match])
      const row = publicProduct(match, input.store.currency, input.channel, input.conversationId)
      state.facts.push(JSON.stringify(row))
      return { products: [row] }
    }

    if (name === 'show_product') {
      const productId = argId(args, 'productId')
      const variantId = argId(args, 'variantId')
      const match =
        (productId != null
          ? cache.get(`${productId}:${variantId ?? 0}`) ?? cache.get(`${productId}:0`)
          : null) ?? null
      if (!match) return { error: 'Unknown product. Search first and use a returned productId.' }
      const stay = stayingOnLast()
      const lastRow = lastProductRows()[0] ?? null
      const base = stay && lastRow ? lastRow : match
      const shown = pickVariantForAsk(input.store.slug, base, customerText, stay)
      markShown(shown, stay && shown.product.name.toLowerCase() === lastShownTitle.toLowerCase())
      return { shown: shown.product.name, url: shown.url }
    }

    if (name === 'get_my_orders') {
      if (!looksLikePlacedOrderAsk(customerText)) {
        const note =
          'Not an existing-order question. Use get_shop_info for delivery before they pay.'
        state.facts.push(note)
        return { orders: [], note }
      }
      const phone = input.customerPhone?.trim()
      if (!phone) {
        const note = 'Order status can only be checked on WhatsApp from the number used at checkout.'
        state.facts.push(note)
        return { orders: [], note }
      }
      const scopeRaw = argString(args, 'scope')
      const scope: OrderScope =
        scopeRaw === 'all' || scopeRaw === 'specific' || scopeRaw === 'product' ? scopeRaw : 'latest'
      const intent = orderIntent(scope, argString(args, 'orderNumber'), argString(args, 'productHint'))
      const collected = await orders({
        store: input.store,
        customerPhone: phone,
        intent,
        conversationId: input.conversationId,
      })
      const selected = selectOrdersForScope(collected, intent)
      state.lookedUpOrders = true
      const policies = parseShopPolicies(input.store.shop_policies)
      const cards = selected.map((order) =>
        formatOrderFactCard(order, input.store.currency, {
          includeCourier: policies.courier_tracking || orderHasCourierDetails(order),
        })
      )
      state.facts.push(cards.join('\n') || 'no orders')
      return { orders: cards }
    }

    if (name === 'get_shop_info') {
      const askRaw = argString(args, 'ask')
      const ask: ShopPolicyAsk =
        askRaw === 'location' ||
        askRaw === 'hours' ||
        askRaw === 'delivery' ||
        askRaw === 'payment' ||
        askRaw === 'returns' ||
        askRaw === 'offers'
          ? askRaw
          : 'general'
      const policies = parseShopPolicies(input.store.shop_policies)
      const copy = formatShopPolicyCustomerCopyForAsk(policies, input.store.currency, ask)
      const payments = ask === 'payment' || ask === 'general' ? paymentFacts(input.store) : ''
      const text = [copy, payments].filter(Boolean).join('\n') || 'not set'
      state.facts.push(text)
      return { facts: text }
    }

    if (name === 'connect_helpline') {
      state.helpline = true
      const line = 'Our customer helpline will contact you. Please wait in this chat.'
      state.facts.push(line)
      return { helpline: true, say: line }
    }

    return { error: `Unknown tool ${name}` }
  }

  function showBestSearchMatch(): void {
    if (state.shown || state.found.length === 0) return
    const last = lastShownTitle.toLowerCase()
    const stay = stayingOnLast()
    const same = last
      ? state.found.find((row) => row.product.name.toLowerCase() === last) ?? null
      : null
    if (stay && same) {
      markShown(pickStayMatch(same) ?? same, true)
      return
    }
    if (stay && last) return
    const pick =
      (!stay && last
        ? state.found.find((row) => row.product.name.toLowerCase() !== last)
        : null) ?? state.found[0]
    markShown(pick, false)
  }

  return { state, runTool, showBestSearchMatch }
}
