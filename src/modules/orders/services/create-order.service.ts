import { findOrCreateByWhatsApp } from '../../customers/repositories/customer.repository.js'
import { findProductsByIds } from '../../products/repositories/product.repository.js'
import * as variantRepository from '../../products/repositories/product-variant.repository.js'
import type { Product } from '../../products/types/product.types.js'
import type { ProductVariant } from '../../products/types/product-variant.types.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { generateOrderNumber } from '../../../shared/utils/generate-order-number.js'
import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'
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
  variantById: Map<string, ProductVariant>
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
      if (product.track_inventory && variant.stock_qty < item.quantity) {
        throw new AppError(
          400,
          `Insufficient stock for ${product.name} (${variant.name})`,
          'INSUFFICIENT_STOCK'
        )
      }
    } else if (item.variant_id) {
      throw new AppError(400, `Product ${product.name} has no variants`, 'INVALID_VARIANT')
    } else if (product.track_inventory && product.stock_qty < item.quantity) {
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
          sku: variant.sku,
          image_url: variant.image_url,
        }
      : null,
  }
}

export async function createOrder(
  storeId: string,
  storeCurrency: string,
  input: CreateOrderInput
): Promise<CreateOrderResult> {
  const customer = await findOrCreateByWhatsApp(
    storeId,
    input.whatsapp_number,
    {
      name: input.shipping_address.name ?? input.name,
      email: input.email,
      address: input.shipping_address,
    }
  )

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

  const shippingAddress = {
    ...input.shipping_address,
    whatsapp_number: normalizeWhatsAppNumber(input.shipping_address.whatsapp_number),
    phone_number: normalizeWhatsAppNumber(input.shipping_address.phone_number),
  }

  const lines = buildLineItems(input.items, products, variantsByProduct, variantById)
  const subtotal = lines.reduce((sum, line) => sum + line.line_total, 0)
  const total = subtotal

  const isCod = input.payment_method === 'cod'
  const orderStatus = isCod ? 'confirmed' : 'pending_payment'
  const paymentProvider = isCod ? 'manual' : 'razorpay'
  const paymentStatus = 'pending'

  const now = new Date().toISOString()

  const order = await orderRepository.insertOrder({
    store_id: storeId,
    customer_id: customer.id,
    conversation_id: input.conversation_id ?? null,
    order_number: generateOrderNumber(),
    status: orderStatus,
    source: 'storefront',
    subtotal,
    discount_amount: 0,
    shipping_fee: 0,
    tax_amount: 0,
    total,
    shipping_address: shippingAddress,
    notes: input.notes ?? null,
    confirmed_at: isCod ? now : null,
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

    const payment = await orderRepository.insertPayment({
      order_id: order.id,
      store_id: storeId,
      provider: paymentProvider,
      amount: total,
      currency: storeCurrency,
      status: paymentStatus,
    })

    const result: CreateOrderResult = {
      order,
      items: orderItems,
      payment,
      customer_id: customer.id,
      payment_method: input.payment_method,
    }

    if (!isCod) {
      result.razorpay = {
        pending: true,
        message:
          'Razorpay payment link will be generated here. Complete Razorpay integration to enable online pay.',
      }
    }

    return result
  } catch (err) {
    await orderRepository.deleteOrder(order.id)
    throw err
  }
}
