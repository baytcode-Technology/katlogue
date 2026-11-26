import { hasPremiumAccess } from '../../../shared/lib/subscription.js'
import {
  buildStorefrontOrigin,
  buildStorefrontProductUrl,
  formatMoney,
  getPublicStorefrontBaseDomain,
} from '../../../shared/utils/storefront.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { completeJson } from '../../../shared/llm/index.js'
import { variantSellingPrice } from '../../products/lib/variant-price.js'
import { findProductById } from '../../products/repositories/product.repository.js'
import { findVariantsByProductIds } from '../../products/repositories/product-variant.repository.js'
import type { Product } from '../../products/types/product.types.js'
import type { ProductVariant } from '../../products/types/product-variant.types.js'
import { isSimpleProductSellable, isVariantSellable } from '../../products/utils/product-inventory.js'
import { createOrder } from '../../orders/services/create-order.service.js'
import { parseStoredPaymentConfig, toPublicPaymentMethods } from '../../payments/lib/payment-config.js'
import { assertPaymentProofUrlForStore } from '../../payments/lib/payment-proof-url.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import type { Store } from '../../stores/types/store.types.js'
import { uploadPaymentProof } from '../../uploads/services/upload-payment-proof.service.js'
import { downloadWhatsAppMedia } from '../../whatsapp/services/whatsapp-media.service.js'
import * as whatsappChatRepository from '../../whatsapp/repositories/whatsapp-chat.repository.js'
import type { WhatsAppConversation } from '../../whatsapp/types/whatsapp-chat.types.js'
import {
  addressFromCheckoutParse,
  isCheckoutExpired,
  isProductQuestion,
  lastCheckoutProduct,
  buyQuantity,
  checkoutChoice,
  matchCheckoutVariant,
  nextCheckoutClaim,
  parsePendingCheckout,
  readImageDecision,
  type PendingCheckout,
} from '../pending-checkout.js'
import {
  claimWhatsAppPendingCheckout,
  clearWhatsAppPendingCheckout,
  saveWhatsAppPendingCheckout,
} from '../repositories/conversation-ai.repository.js'
import { filterSessionHistory } from './conversation-history.service.js'
import type { ConversationHistoryLine } from './parse-customer-intent.service.js'
import { readPaymentScreenshot } from './read-payment-screenshot.service.js'
import {
  sendAutoReplyWhatsAppImage,
  sendAutoReplyWhatsAppText,
} from './send-auto-reply-whatsapp.service.js'

const ADDRESS_PROMPT = `Extract a delivery address from the customer message.
Reply with JSON keys name, address, city, district, state, postcode.
Use an empty string when a field is missing. Do not invent a PIN, city, district, or state.`

const UNAVAILABLE_CODES = new Set([
  'INSUFFICIENT_STOCK',
  'PRODUCT_INACTIVE',
  'VARIANT_INACTIVE',
  'VARIANT_REQUIRED',
  'INVALID_VARIANT',
  'INVALID_PRODUCT',
])

type Offer = {
  product: Product
  sellable: ProductVariant[]
  variant: ProductVariant | null
  total: number
  url: string
}

function productUrl(store: Store, product: Product, variantId: number | null): string {
  return buildStorefrontProductUrl(
    store.slug,
    getPublicStorefrontBaseDomain(),
    { id: product.id, name: product.name },
    variantId,
    {
      origin: buildStorefrontOrigin({
        slug: store.slug,
        customDomain: store.custom_domain,
        customDomainStatus: store.custom_domain_status,
        publicLinkHost: store.public_link_host,
      }),
    }
  )
}

function choiceMessage(title: string): string {
  return `Want to buy ${title}?\nReply website for the link, or pay here for the UPI QR.`
}

function proofMessage(amount: string): string {
  return `Send the payment success screenshot that shows ${amount}.`
}

async function reply(input: {
  storeId: number
  conversationId: number
  to: string
  message: string
}): Promise<void> {
  await sendAutoReplyWhatsAppText({
    storeId: input.storeId,
    conversationId: input.conversationId,
    customerWaNumber: input.to,
    message: input.message,
  })
}

async function save(storeId: number, conversationId: number, checkout: PendingCheckout): Promise<void> {
  await saveWhatsAppPendingCheckout({ storeId, conversationId, checkout })
}

async function clear(storeId: number, conversationId: number): Promise<void> {
  await clearWhatsAppPendingCheckout({ storeId, conversationId })
}

async function loadOffer(store: Store, checkout: PendingCheckout): Promise<Offer | null> {
  const product = await findProductById(checkout.product_id)
  if (!product || product.store_id !== store.id || !product.is_active || product.status !== 'active') {
    return null
  }

  const grouped = await findVariantsByProductIds([product.id])
  const sellable = (grouped.get(product.id) ?? []).filter((variant) => isVariantSellable(product, variant))
  let variant: ProductVariant | null = null
  if (checkout.variant_id) {
    variant = sellable.find((row) => row.id === checkout.variant_id) ?? null
    if (!variant) return null
  } else if (sellable.length > 0) {
    return null
  } else if (!isSimpleProductSellable(product)) {
    return null
  }

  return {
    product,
    sellable,
    variant,
    total: variantSellingPrice(product.base_price, variant) * checkout.quantity,
    url: productUrl(store, product, variant?.id ?? null),
  }
}

async function sendPaymentRequest(input: {
  store: Store
  conversationId: number
  to: string
  total: number
}): Promise<void> {
  const methods = toPublicPaymentMethods(parseStoredPaymentConfig(input.store.payment_config))
  const amount = formatMoney(input.total, input.store.currency)
  const vpa = methods.upi.vpa?.trim() || 'the shop UPI id'
  const message = `Pay ${amount} to ${vpa}.\nAfter you pay, send the payment success screenshot here.`
  const qr = methods.upi.qr_image_url?.trim()
  if (!qr) {
    await reply({
      storeId: input.store.id,
      conversationId: input.conversationId,
      to: input.to,
      message,
    })
    return
  }

  try {
    await sendAutoReplyWhatsAppImage({
      storeId: input.store.id,
      conversationId: input.conversationId,
      customerWaNumber: input.to,
      imageUrl: qr,
      caption: message,
    })
  } catch (err) {
    console.error('[inbox-ai] checkout QR send failed', err)
    await reply({
      storeId: input.store.id,
      conversationId: input.conversationId,
      to: input.to,
      message,
    })
  }
}

async function beginCheckout(input: {
  store: Store
  conversation: WhatsAppConversation
  text: string
  recentMessages: ConversationHistoryLine[]
  payHere?: boolean
  quantity?: number
}): Promise<boolean> {
  const shown = lastCheckoutProduct(input.recentMessages)
  if (!shown) return false

  const product = await findProductById(shown.productId)
  if (!product || product.store_id !== input.store.id || !product.is_active || product.status !== 'active') {
    return false
  }

  const grouped = await findVariantsByProductIds([product.id])
  const sellable = (grouped.get(product.id) ?? []).filter((variant) => isVariantSellable(product, variant))
  if (sellable.length === 0 && !isSimpleProductSellable(product)) return false

  const quantity = input.quantity ?? buyQuantity(input.text)
  const fromUrl = shown.variantId ? sellable.find((variant) => variant.id === shown.variantId) ?? null : null
  const fromText = matchCheckoutVariant(sellable, input.text)
  const variant = fromUrl ?? (sellable.length === 1 ? sellable[0] : fromText)
  if (sellable.length > 0 && !variant) {
    const checkout: PendingCheckout = {
      status: 'need_variant',
      product_id: product.id,
      variant_id: null,
      quantity,
      title: product.name,
      address: null,
      created_at: new Date().toISOString(),
    }
    await save(input.store.id, input.conversation.id, checkout)
    await reply({
      storeId: input.store.id,
      conversationId: input.conversation.id,
      to: input.conversation.customer_wa_number,
      message: `Which one do you want for ${product.name}? ${sellable.map((row) => row.name).filter(Boolean).join(', ')}`,
    })
    return true
  }

  const checkout: PendingCheckout = {
    status: 'choosing',
    product_id: product.id,
    variant_id: variant?.id ?? null,
    quantity,
    title: variant ? `${product.name} — ${variant.name}` : product.name,
    address: null,
    created_at: new Date().toISOString(),
  }
  if (input.payHere) {
    await beginPayHere({
      store: input.store,
      conversation: input.conversation,
      checkout,
      url: productUrl(input.store, product, variant?.id ?? null),
    })
    return true
  }
  await save(input.store.id, input.conversation.id, checkout)
  await reply({
    storeId: input.store.id,
    conversationId: input.conversation.id,
    to: input.conversation.customer_wa_number,
    message: choiceMessage(checkout.title),
  })
  return true
}

export async function startWhatsAppBookCheckout(input: {
  store: Store
  conversation: WhatsAppConversation
  text: string
  recentMessages: ConversationHistoryLine[]
  payHere: boolean
  quantity: number
}): Promise<boolean> {
  return beginCheckout(input)
}

async function continueVariant(input: {
  store: Store
  conversation: WhatsAppConversation
  checkout: PendingCheckout
  text: string
}): Promise<boolean> {
  const product = await findProductById(input.checkout.product_id)
  if (!product || product.store_id !== input.store.id || !product.is_active || product.status !== 'active') {
    await clear(input.store.id, input.conversation.id)
    await reply({
      storeId: input.store.id,
      conversationId: input.conversation.id,
      to: input.conversation.customer_wa_number,
      message: 'That item is not available to order right now.',
    })
    return true
  }

  const grouped = await findVariantsByProductIds([product.id])
  const sellable = (grouped.get(product.id) ?? []).filter((variant) => isVariantSellable(product, variant))
  if (sellable.length === 0) {
    await clear(input.store.id, input.conversation.id)
    await reply({
      storeId: input.store.id,
      conversationId: input.conversation.id,
      to: input.conversation.customer_wa_number,
      message: 'That item is not available to order right now.',
    })
    return true
  }
  const matched = matchCheckoutVariant(sellable, input.text)
  if (!matched) {
    if (isProductQuestion(input.text, [])) {
      await clear(input.store.id, input.conversation.id)
      return false
    }
    await reply({
      storeId: input.store.id,
      conversationId: input.conversation.id,
      to: input.conversation.customer_wa_number,
      message: `Which one do you want for ${product.name}? ${sellable.map((row) => row.name).filter(Boolean).join(', ')}`,
    })
    return true
  }

  const checkout: PendingCheckout = {
    ...input.checkout,
    status: 'choosing',
    variant_id: matched.id,
    title: `${product.name} — ${matched.name}`,
  }
  await save(input.store.id, input.conversation.id, checkout)
  await reply({
    storeId: input.store.id,
    conversationId: input.conversation.id,
    to: input.conversation.customer_wa_number,
    message: choiceMessage(checkout.title),
  })
  return true
}

async function payOnWebsite(input: {
  store: Store
  conversation: WhatsAppConversation
  url: string
}): Promise<void> {
  await clear(input.store.id, input.conversation.id)
  await reply({
    storeId: input.store.id,
    conversationId: input.conversation.id,
    to: input.conversation.customer_wa_number,
    message: `Buy it here:\n${input.url}`,
  })
}

async function beginPayHere(input: {
  store: Store
  conversation: WhatsAppConversation
  checkout: PendingCheckout
  url: string
}): Promise<void> {
  const methods = toPublicPaymentMethods(parseStoredPaymentConfig(input.store.payment_config))
  if (!methods.upi.enabled || !methods.upi.vpa) {
    await payOnWebsite(input)
    return
  }

  await save(input.store.id, input.conversation.id, { ...input.checkout, status: 'need_address' })
  await reply({
    storeId: input.store.id,
    conversationId: input.conversation.id,
    to: input.conversation.customer_wa_number,
    message: 'Send the delivery details in one message: name, address, city, district, state, and PIN.',
  })
}

async function continueAddress(input: {
  store: Store
  conversation: WhatsAppConversation
  checkout: PendingCheckout
  text: string
  total: number
}): Promise<boolean> {
  if (isProductQuestion(input.text)) {
    await clear(input.store.id, input.conversation.id)
    return false
  }

  let parsed: Record<string, unknown> | null = null
  try {
    parsed = await completeJson<Record<string, unknown>>(ADDRESS_PROMPT, input.text)
  } catch (err) {
    console.error('[inbox-ai] checkout address parse failed', err)
  }
  const address = addressFromCheckoutParse(parsed, input.conversation.customer_wa_number)
  if (!address.ok) {
    const missing = address.missing.filter((field) => field !== 'phone')
    await reply({
      storeId: input.store.id,
      conversationId: input.conversation.id,
      to: input.conversation.customer_wa_number,
      message: missing.length
        ? `I still need ${missing.join(', ')}.`
        : 'Send the delivery details in one message: name, address, city, district, state, and PIN.',
    })
    return true
  }

  const checkout: PendingCheckout = {
    ...input.checkout,
    status: 'awaiting_proof',
    address: address.address,
  }
  await save(input.store.id, input.conversation.id, checkout)
  await sendPaymentRequest({
    store: input.store,
    conversationId: input.conversation.id,
    to: input.conversation.customer_wa_number,
    total: input.total,
  })
  return true
}

function proofImageMime(buffer: Buffer, header: string): string | null {
  const lower = header.toLowerCase()
  if (lower.includes('png')) return 'image/png'
  if (lower.includes('webp')) return 'image/webp'
  if (lower.includes('gif')) return 'image/gif'
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'image/jpeg'
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  if (buffer.length >= 6 && buffer.toString('ascii', 0, 3) === 'GIF') return 'image/gif'
  return null
}

export async function handleWhatsAppCheckoutText(input: {
  store: Store
  conversation: WhatsAppConversation
  text: string
  recentMessages: ConversationHistoryLine[]
}): Promise<boolean> {
  const recentMessages = filterSessionHistory(input.recentMessages)
  let checkout = parsePendingCheckout(input.conversation.pending_checkout)
  if (checkout && isCheckoutExpired(checkout)) {
    await clear(input.store.id, input.conversation.id)
    checkout = null
  }

  if (!checkout) return false

  if (checkout.status === 'creating') {
    await reply({
      storeId: input.store.id,
      conversationId: input.conversation.id,
      to: input.conversation.customer_wa_number,
      message: 'The order is being placed. Please wait a moment.',
    })
    return true
  }

  if (checkout.status === 'need_variant') {
    return continueVariant({
      store: input.store,
      conversation: input.conversation,
      checkout,
      text: input.text,
    })
  }

  const offer = await loadOffer(input.store, checkout)
  if (!offer) {
    await clear(input.store.id, input.conversation.id)
    await reply({
      storeId: input.store.id,
      conversationId: input.conversation.id,
      to: input.conversation.customer_wa_number,
      message: 'That item is not available to order right now.',
    })
    return true
  }

  if (checkout.status === 'choosing') {
    const choice = checkoutChoice(input.text)
    if (choice === 'website') {
      await payOnWebsite({ store: input.store, conversation: input.conversation, url: offer.url })
      return true
    }
    if (choice === 'pay_here') {
      await beginPayHere({
        store: input.store,
        conversation: input.conversation,
        checkout,
        url: offer.url,
      })
      return true
    }
    if (isProductQuestion(input.text, recentMessages)) {
      await clear(input.store.id, input.conversation.id)
      return false
    }
    await reply({
      storeId: input.store.id,
      conversationId: input.conversation.id,
      to: input.conversation.customer_wa_number,
      message: choiceMessage(checkout.title),
    })
    return true
  }

  if (checkout.status === 'need_address') {
    return continueAddress({
      store: input.store,
      conversation: input.conversation,
      checkout,
      text: input.text,
      total: offer.total,
    })
  }

  if (isProductQuestion(input.text, recentMessages)) {
    await clear(input.store.id, input.conversation.id)
    return false
  }

  await reply({
    storeId: input.store.id,
    conversationId: input.conversation.id,
    to: input.conversation.customer_wa_number,
    message: proofMessage(formatMoney(offer.total, input.store.currency)),
  })
  return true
}

export async function handleWhatsAppCheckoutImage(input: {
  storeId: number
  conversationId: number
  mediaId: string
}): Promise<void> {
  const store = await storeRepository.findStoreById(input.storeId)
  if (!store || !hasPremiumAccess(store) || !store.ai_auto_reply_enabled) return

  const conversation = await whatsappChatRepository.findConversationById({
    storeId: input.storeId,
    conversationId: input.conversationId,
  })
  if (!conversation || conversation.reply_mode === 'manual') return

  const checkout = parsePendingCheckout(conversation.pending_checkout)
  if (!checkout) return
  if (isCheckoutExpired(checkout)) {
    await clear(store.id, conversation.id)
    return
  }
  if (checkout.status !== 'awaiting_proof') return

  const offer = await loadOffer(store, checkout)
  if (!offer || !checkout.address) {
    await clear(store.id, conversation.id)
    await reply({
      storeId: store.id,
      conversationId: conversation.id,
      to: conversation.customer_wa_number,
      message: 'That item is not available to order right now.',
    })
    return
  }

  const amountLabel = formatMoney(offer.total, store.currency)
  let claimed = false
  let placed = false
  try {
    const downloaded = await downloadWhatsAppMedia({ storeId: store.id, mediaId: input.mediaId })
    const mimeType = proofImageMime(downloaded.buffer, downloaded.mimeType)
    if (!mimeType) {
      await reply({
        storeId: store.id,
        conversationId: conversation.id,
        to: conversation.customer_wa_number,
        message: proofMessage(amountLabel),
      })
      return
    }
    const shot = await readPaymentScreenshot(downloaded.buffer, mimeType)
    const decision = readImageDecision({
      checkout,
      nowMs: Date.now(),
      isPaymentSuccess: shot?.isPaymentSuccess ?? false,
      amount: shot?.amount ?? null,
      catalogTotal: offer.total,
    })
    if (decision !== 'create') {
      await reply({
        storeId: store.id,
        conversationId: conversation.id,
        to: conversation.customer_wa_number,
        message: proofMessage(amountLabel),
      })
      return
    }

    const next = nextCheckoutClaim(checkout)
    if (!next) return
    const won = await claimWhatsAppPendingCheckout({
      storeId: store.id,
      conversationId: conversation.id,
      checkout: next,
    })
    if (!won) return
    claimed = true

    let orderNumber = ''
    try {
      const proofUrl = await uploadPaymentProof(store.id, {
        buffer: downloaded.buffer,
        mimetype: mimeType,
      })
      assertPaymentProofUrlForStore(proofUrl, store.id)
      const order = await createOrder(store.id, store.currency, {
        whatsapp_number: conversation.customer_wa_number,
        name: checkout.address.name,
        items: [
          {
            product_id: checkout.product_id,
            quantity: checkout.quantity,
            ...(checkout.variant_id ? { variant_id: checkout.variant_id } : {}),
          },
        ],
        payment_method: 'upi',
        payment_proof_url: proofUrl,
        shipping_address: checkout.address,
        conversation_id: conversation.id,
        source: 'whatsapp',
      })
      orderNumber = order.order.order_number
      placed = true
    } catch (err) {
      console.error('[inbox-ai] whatsapp checkout order failed', err)
      const code = err instanceof AppError ? err.code : undefined
      if (code && UNAVAILABLE_CODES.has(code)) {
        await clear(store.id, conversation.id)
        claimed = false
        await reply({
          storeId: store.id,
          conversationId: conversation.id,
          to: conversation.customer_wa_number,
          message: 'That item is not available to order right now.',
        })
        return
      }
      await save(store.id, conversation.id, { ...checkout, status: 'awaiting_proof' })
      claimed = false
      await reply({
        storeId: store.id,
        conversationId: conversation.id,
        to: conversation.customer_wa_number,
        message: 'I could not place the order. Please send the payment screenshot again.',
      })
      return
    }

    try {
      await clear(store.id, conversation.id)
    } catch (err) {
      console.error('[inbox-ai] whatsapp checkout clear failed after order', err)
    }
    await reply({
      storeId: store.id,
      conversationId: conversation.id,
      to: conversation.customer_wa_number,
      message: `Order ${orderNumber} is placed. The shop will confirm the payment.`,
    })
  } catch (err) {
    console.error('[inbox-ai] whatsapp checkout image failed', err)
    if (claimed && !placed) {
      try {
        await save(store.id, conversation.id, { ...checkout, status: 'awaiting_proof' })
      } catch (restoreErr) {
        console.error('[inbox-ai] whatsapp checkout restore failed', restoreErr)
      }
    }
    if (placed) return
    await reply({
      storeId: store.id,
      conversationId: conversation.id,
      to: conversation.customer_wa_number,
      message: proofMessage(amountLabel),
    })
  }
}
