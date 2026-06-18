import { randomBytes } from 'crypto'
import {
  appendOrderToCustomer,
  findCustomerById,
  findOrCreateByWhatsApp,
  resolveStorefrontCustomer,
} from '../../customers/repositories/customer.repository.js'
import { toOrderShippingSnapshot } from '../../customers/lib/shipping-addresses.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import {
  assertPaymentMethodEnabled,
  parseStoredPaymentConfig,
  toPublicPaymentMethods,
} from '../../payments/lib/payment-config.js'
import { createRazorpayOrder } from '../../payments/services/razorpay.service.js'
import {
  adjustProductStock,
  findProductsByIds,
} from '../../products/repositories/product.repository.js'
import * as variantRepository from '../../products/repositories/product-variant.repository.js'
import type { Product } from '../../products/types/product.types.js'
import type { ProductVariant } from '../../products/types/product-variant.types.js'
import {
  effectiveProductStockQty,
  effectiveVariantStockQty,
  shouldDecrementProductStock,
  shouldDecrementVariantStock,
  shouldValidateProductStock,
  shouldValidateVariantStock,
} from '../../products/utils/product-inventory.js'
import { AppError } from '../../../shared/errors/app.error.js'
import {
  assertWithinMonthlyOrderLimit,
  hasPremiumAccess,
} from '../../../shared/lib/subscription.js'
import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'
import { notifyNewOrder } from '../../notifications/services/send-store-notification.service.js'
import { emitToStore } from '../../../websocket/index.js'
import { SOCKET_EVENTS } from '../../../websocket/events.js'
import type { OptionalShippingAddress } from '../../../shared/validations/shipping-address.validation.js'
import type { StorefrontShippingAddress } from '../../../shared/validations/shipping-address.validation.js'
import * as orderRepository from '../repositories/order.repository.js'
import type {
  CreateOrderInput,
  CreateOrderResult,
  OrderItemInput,
} from '../types/order.types.js'

type LineItem = {
  input: OrderItemInput
  product: Product
  variant: ProductVariant | null
  unit_price: number
  line_total: number
}

function buildLineItems(
  items: OrderItemInput[],
  products: Product[],
  variantsByProduct: Map<string, ProductVariant[]>,
  variantById: Map<string, ProductVariant>,
  offline: boolean
): LineItem[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const lines: LineItem[] = []

  for (const item of items) {
    const product = byId.get(item.product_id)
    if (!product) {
      throw new AppError(400, `Product not found: ${item.product_id}`, 'INVALID_PRODUCT')
    }
    if (!product.is_active) {
      throw new AppError(400, `Product is not available: ${product.name}`, 'PRODUCT_INACTIVE')
    }

    const productVariants = variantsByProduct.get(product.id) ?? []
    let variant: ProductVariant | null = null

    if (productVariants.length > 0) {
      if (!item.variant_id) {
        throw new AppError(
          400,
          `Please select a variant for ${product.name}`,
          'VARIANT_REQUIRED'
        )
      }
      variant = variantById.get(item.variant_id) ?? null
      if (!variant || variant.product_id !== product.id) {
        throw new AppError(400, `Invalid variant for ${product.name}`, 'INVALID_VARIANT')
      }
      if (!variant.is_active) {
        throw new AppError(400, `Variant is not available: ${variant.name}`, 'VARIANT_INACTIVE')
      }
      if (
        !offline &&
        shouldValidateVariantStock(product, variant) &&
        effectiveVariantStockQty(product, variant) < item.quantity
      ) {
        throw new AppError(
          400,
          `Insufficient stock for ${product.name} (${variant.name})`,
          'INSUFFICIENT_STOCK'
        )
      }
    } else if (item.variant_id) {
      throw new AppError(400, `Product ${product.name} has no variants`, 'INVALID_VARIANT')
    } else if (
      !offline &&
      shouldValidateProductStock(product) &&
      effectiveProductStockQty(product) < item.quantity
    ) {
      throw new AppError(
        400,
        `Insufficient stock for ${product.name}`,
        'INSUFFICIENT_STOCK'
      )
    }

    const unit_price = variant
      ? Number(product.base_price) + Number(variant.price_delta)
      : Number(product.base_price)

    lines.push({
      input: item,
      product,
      variant,
      unit_price,
      line_total: unit_price * item.quantity,
    })
  }

  return lines
}

function buildItemSnapshot(product: Product, variant: ProductVariant | null): Record<string, unknown> {
  return {
    product: {
      id: product.id,
      name: product.name,
      description: product.description,
      sku: product.sku,
      base_price: product.base_price,
      compare_at_price: product.compare_at_price,
      thumbnail_url: product.thumbnail_url,
      images: product.images,
    },
    variant: variant
      ? {
          id: variant.id,
          name: variant.name,
          options: variant.options,
          price_delta: variant.price_delta,
          compare_at_price: variant.compare_at_price,
          sku: variant.sku,
          image_url: variant.image_url,
        }
      : null,
  }
}

function normalizeShippingAddress(
  raw: OptionalShippingAddress | undefined,
  whatsappNumber?: string
): Record<string, unknown> {
  const address: Record<string, unknown> = { ...(raw ?? {}) }

  if (!address.address && typeof address.region === 'string' && address.region.trim()) {
    address.address = address.region
  }

  if (whatsappNumber) {
    address.whatsapp_number = normalizeWhatsAppNumber(whatsappNumber)
  } else if (typeof address.whatsapp_number === 'string' && address.whatsapp_number.trim()) {
    address.whatsapp_number = normalizeWhatsAppNumber(address.whatsapp_number)
  }

  if (typeof address.phone_number === 'string' && address.phone_number.trim()) {
    address.phone_number = normalizeWhatsAppNumber(address.phone_number)
  }

  return address
}

async function decrementInventory(lines: LineItem[]): Promise<void> {
  for (const line of lines) {
    const delta = -line.input.quantity
    if (line.variant) {
      if (!shouldDecrementVariantStock(line.product, line.variant)) continue
      await variantRepository.adjustVariantStock(line.variant.id, delta)
    } else {
      if (!shouldDecrementProductStock(line.product)) continue
      await adjustProductStock(line.product.id, delta)
    }
  }
}

export async function createOrder(
  storeId: string,
  storeCurrency: string,
  input: CreateOrderInput
): Promise<CreateOrderResult> {
  const isStorefront = input.source === 'storefront'
  const whatsapp = input.whatsapp_number?.trim()
  let shippingAddress: Record<string, unknown>
  let customerId: string | null = null

  if (isStorefront) {
    const storefrontShipping = input.shipping_address as StorefrontShippingAddress
    const phone = storefrontShipping.phone_number?.trim() || ''

    if (!phone) {
      throw new AppError(400, 'Phone number is required', 'PHONE_REQUIRED')
    }

    const customer = await resolveStorefrontCustomer({
      storeId,
      phone,
      shippingAddress: storefrontShipping,
      name: storefrontShipping.name,
    })
    customerId = customer.id
    shippingAddress = toOrderShippingSnapshot(storefrontShipping, customer.whatsapp_number)
  } else {
    shippingAddress = normalizeShippingAddress(input.shipping_address, whatsapp)

    if (input.customer_id) {
      const customer = await findCustomerById(input.customer_id, storeId)
      if (!customer) {
        throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND')
      }
      customerId = customer.id
      if (!whatsapp && customer.whatsapp_number && !customer.whatsapp_number.startsWith('offline-')) {
        shippingAddress.whatsapp_number = customer.whatsapp_number
      }
      if (!input.name && customer.name) {
        shippingAddress.name = customer.name
      }
    } else if (whatsapp) {
      const customer = await findOrCreateByWhatsApp(storeId, whatsapp, {
        name: input.shipping_address?.name ?? input.name,
        email: input.email,
        address: shippingAddress,
      })
      customerId = customer.id
    }
  }

  const productIds = [...new Set(input.items.map((i) => i.product_id))]
  const products = await findProductsByIds(storeId, productIds)

  if (products.length !== productIds.length) {
    throw new AppError(400, 'One or more products are invalid for this store', 'INVALID_PRODUCT')
  }

  const variantsByProduct = await variantRepository.findVariantsByProductIds(productIds)
  const variantIds = input.items
    .map((i) => i.variant_id)
    .filter((id): id is string => Boolean(id))

  const variantById = new Map<string, ProductVariant>()
  for (const id of variantIds) {
    const variant = await variantRepository.findVariantById(id)
    if (!variant) {
      throw new AppError(400, `Variant not found: ${id}`, 'INVALID_VARIANT')
    }
    const product = products.find((p) => p.id === variant.product_id)
    if (!product || product.store_id !== storeId) {
      throw new AppError(400, 'Variant does not belong to this store', 'INVALID_VARIANT')
    }
    variantById.set(id, variant)
  }

  const offline = input.offline === true
  const lines = buildLineItems(
    input.items,
    products,
    variantsByProduct,
    variantById,
    offline
  )
  const subtotal = lines.reduce((sum, line) => sum + line.line_total, 0)
  const total = subtotal

  const store = await storeRepository.findStoreById(storeId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  if (!hasPremiumAccess(store)) {
    const monthlyOrders = await orderRepository.countOrdersInCurrentMonth(storeId)
    assertWithinMonthlyOrderLimit(monthlyOrders)
  }

  const storedPaymentConfig = parseStoredPaymentConfig(store.payment_config)
  if (input.source === 'storefront' || !input.offline) {
    assertPaymentMethodEnabled(storedPaymentConfig, input.payment_method)
  }

  const isCod = input.payment_method === 'cod'
  const isUpi = input.payment_method === 'upi'
  const paymentProvider = isCod ? 'manual' : isUpi ? 'upi_manual' : 'razorpay'
  const paymentStatus = isUpi ? 'confirming' : 'pending'
  const orderStatus = isCod ? 'confirmed' : 'pending'
  const orderPaymentStatus = isUpi ? 'confirming' : 'pending'
  const checkoutToken = randomBytes(24).toString('hex')

  const orderNumber = await orderRepository.allocateOrderNumber(storeId)

  const order = await orderRepository.insertOrder({
    store_id: storeId,
    customer_id: customerId,
    conversation_id: input.conversation_id ?? null,
    order_number: orderNumber,
    order_status: orderStatus,
    payment_status: orderPaymentStatus,
    fulfillment_status: 'unfulfilled',
    source: input.source ?? 'storefront',
    subtotal,
    discount_amount: 0,
    shipping_fee: 0,
    tax_amount: 0,
    total,
    shipping_address: shippingAddress,
    notes: input.notes ?? null,
    checkout_token: checkoutToken,
  })

  try {
    const orderItems = await orderRepository.insertOrderItems(
      lines.map((line) => ({
        order_id: order.id,
        product_id: line.product.id,
        variant_id: line.variant?.id ?? null,
        quantity: line.input.quantity,
        unit_price: line.unit_price,
        snapshot: buildItemSnapshot(line.product, line.variant),
      }))
    )

    let payment = await orderRepository.insertPayment({
      order_id: order.id,
      store_id: storeId,
      provider: paymentProvider,
      amount: total,
      currency: storeCurrency,
      status: paymentStatus,
    })

    await decrementInventory(lines)

    const result: CreateOrderResult = {
      order,
      items: orderItems,
      payment,
      customer_id: customerId,
      payment_method: input.payment_method,
      checkout_token: checkoutToken,
    }

    if (input.payment_method === 'razorpay') {
      const razorpayOrder = await createRazorpayOrder({
        storedConfig: storedPaymentConfig,
        amount: total,
        currency: storeCurrency,
        receipt: order.order_number,
        notes: {
          store_id: storeId,
          order_id: order.id,
          payment_id: payment.id,
        },
      })
      payment = await orderRepository.updatePayment(payment.id, {
        provider_order_id: razorpayOrder.order_id,
      })
      result.payment = payment
      result.razorpay = razorpayOrder
    }

    if (isUpi) {
      const publicMethods = toPublicPaymentMethods(storedPaymentConfig)
      result.upi = {
        vpa: publicMethods.upi.vpa ?? '',
        qr_image_url: publicMethods.upi.qr_image_url,
        display_name: publicMethods.upi.display_name,
        amount: total,
        currency: storeCurrency,
        reference: order.order_number,
      }
    }

    const item_quantity = orderItems.reduce((sum, item) => sum + item.quantity, 0)

    const orderSource = input.source ?? 'storefront'
    emitToStore(storeId, SOCKET_EVENTS.ORDER_NEW, {
      storeId,
      order: {
        id: order.id,
        order_number: order.order_number,
        total: order.total,
        currency: storeCurrency,
        source: orderSource,
        store_slug: store.slug,
        item_quantity,
      },
    })

    void notifyNewOrder({
      storeId,
      storeSlug: store.slug,
      orderId: order.id,
      orderNumber: order.order_number,
      total: order.total,
      currency: storeCurrency,
      source: orderSource,
    }).catch((err) => {
      console.error('[notifications] order push failed', err)
    })

    if (isStorefront && customerId) {
      await appendOrderToCustomer(customerId, storeId, order.id, order.total)
    }

    await storeRepository.incrementOrderCount(storeId)

    return result
  } catch (err) {
    await orderRepository.deleteOrder(order.id)
    throw err
  }
}
