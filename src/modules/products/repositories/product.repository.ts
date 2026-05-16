import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { CreateProductInput, Product } from '../types/product.types.js'

export async function assertStoreOwner(
  storeId: string,
  ownerId: string
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('owner_id', ownerId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'STORE_LOOKUP_FAILED')
  }

  if (!data) {
    throw new AppError(403, 'You do not have access to this store', 'FORBIDDEN')
  }
}

export async function assertCategoryBelongsToStore(
  categoryId: string,
  storeId: string
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'CATEGORY_LOOKUP_FAILED')
  }

  if (!data) {
    throw new AppError(
      400,
      'Category not found or does not belong to this store',
      'INVALID_CATEGORY'
    )
  }
}

export async function insertProduct(input: CreateProductInput): Promise<Product> {
  const row = {
    store_id: input.store_id,
    name: input.name,
    base_price: input.base_price,
    category_id: input.category_id ?? null,
    description: input.description ?? null,
    sku: input.sku ?? null,
    compare_at_price: input.compare_at_price ?? null,
    track_inventory: input.track_inventory,
    stock_qty: input.stock_qty,
    images: input.images,
    thumbnail_url: input.thumbnail_url ?? null,
    is_active: input.is_active,
    sort_order: input.sort_order,
    metadata: input.metadata,
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .insert(row)
    .select()
    .single()

  if (error) {
    throw new AppError(400, error.message, 'PRODUCT_CREATE_FAILED')
  }

  return data as Product
}
