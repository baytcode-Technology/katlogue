import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type {
  CreateProductVariantInput,
  ProductVariant,
  UpdateProductVariantInput,
} from '../types/product-variant.types.js'

export async function insertVariants(
  productId: string,
  variants: CreateProductVariantInput[]
): Promise<ProductVariant[]> {
  if (variants.length === 0) return []

  const rows = variants.map((v) => ({
    product_id: productId,
    name: v.name,
    options: v.options ?? {},
    price_delta: v.price_delta,
    compare_at_price: v.compare_at_price ?? null,
    stock_qty: v.stock_qty,
    sku: v.sku ?? null,
    image_url: v.image_url ?? null,
    is_active: v.is_active,
    sort_order: v.sort_order,
  }))

  const { data, error } = await supabaseAdmin
    .from('product_variants')
    .insert(rows)
    .select()

  if (error) {
    throw new AppError(400, error.message, 'VARIANT_CREATE_FAILED')
  }

  return (data ?? []) as ProductVariant[]
}

export async function findVariantsByProductId(productId: string): Promise<ProductVariant[]> {
  const { data, error } = await supabaseAdmin
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })

  if (error) {
    throw new AppError(400, error.message, 'VARIANT_LOOKUP_FAILED')
  }

  return (data ?? []) as ProductVariant[]
}

export async function findVariantsByProductIds(
  productIds: string[]
): Promise<Map<string, ProductVariant[]>> {
  const map = new Map<string, ProductVariant[]>()
  if (productIds.length === 0) return map

  const { data, error } = await supabaseAdmin
    .from('product_variants')
    .select('*')
    .in('product_id', productIds)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    throw new AppError(400, error.message, 'VARIANT_LOOKUP_FAILED')
  }

  for (const row of (data ?? []) as ProductVariant[]) {
    const list = map.get(row.product_id) ?? []
    list.push(row)
    map.set(row.product_id, list)
  }

  return map
}

export async function findVariantById(variantId: string): Promise<ProductVariant | null> {
  const { data, error } = await supabaseAdmin
    .from('product_variants')
    .select('*')
    .eq('id', variantId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'VARIANT_LOOKUP_FAILED')
  }

  return data as ProductVariant | null
}

export async function assertVariantBelongsToProduct(
  variantId: string,
  productId: string
): Promise<ProductVariant> {
  const variant = await findVariantById(variantId)
  if (!variant || variant.product_id !== productId) {
    throw new AppError(404, 'Variant not found for this product', 'VARIANT_NOT_FOUND')
  }
  return variant
}

export async function insertVariant(
  productId: string,
  input: CreateProductVariantInput
): Promise<ProductVariant> {
  const rows = await insertVariants(productId, [input])
  const created = rows[0]
  if (!created) {
    throw new AppError(400, 'Failed to create variant', 'VARIANT_CREATE_FAILED')
  }
  return created
}

export async function updateVariant(
  variantId: string,
  patch: UpdateProductVariantInput
): Promise<ProductVariant> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.options !== undefined) row.options = patch.options
  if (patch.price_delta !== undefined) row.price_delta = patch.price_delta
  if (patch.compare_at_price !== undefined) row.compare_at_price = patch.compare_at_price
  if (patch.stock_qty !== undefined) row.stock_qty = patch.stock_qty
  if (patch.sku !== undefined) row.sku = patch.sku
  if (patch.image_url !== undefined) row.image_url = patch.image_url
  if (patch.is_active !== undefined) row.is_active = patch.is_active
  if (patch.sort_order !== undefined) row.sort_order = patch.sort_order

  const { data, error } = await supabaseAdmin
    .from('product_variants')
    .update(row)
    .eq('id', variantId)
    .select()
    .single()

  if (error) {
    throw new AppError(400, error.message, 'VARIANT_UPDATE_FAILED')
  }

  return data as ProductVariant
}

export async function adjustVariantStock(variantId: string, delta: number): Promise<void> {
  const variant = await findVariantById(variantId)
  if (!variant) {
    throw new AppError(404, 'Variant not found', 'VARIANT_NOT_FOUND')
  }

  const { error } = await supabaseAdmin
    .from('product_variants')
    .update({ stock_qty: variant.stock_qty + delta })
    .eq('id', variantId)

  if (error) {
    throw new AppError(400, error.message, 'VARIANT_STOCK_UPDATE_FAILED')
  }
}

export async function deleteVariant(variantId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('product_variants').delete().eq('id', variantId)

  if (error) {
    throw new AppError(400, error.message, 'VARIANT_DELETE_FAILED')
  }
}
