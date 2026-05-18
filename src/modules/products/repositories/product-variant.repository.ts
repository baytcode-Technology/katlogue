import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type {
  CreateProductVariantInput,
  ProductVariant,
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
