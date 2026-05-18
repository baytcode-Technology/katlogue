import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { CreateProductInput, Product, UpdateProductInput } from '../types/product.types.js'

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

export async function findActiveProductsByStoreId(storeId: string): Promise<Product[]> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new AppError(400, error.message, 'PRODUCT_LIST_FAILED')
  }

  return (data ?? []) as Product[]
}

export async function findProductsByIds(
  storeId: string,
  productIds: string[]
): Promise<Product[]> {
  if (productIds.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .in('id', productIds)

  if (error) {
    throw new AppError(400, error.message, 'PRODUCT_LOOKUP_FAILED')
  }

  return (data ?? []) as Product[]
}

export async function findProductById(productId: string): Promise<Product | null> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', productId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'PRODUCT_LOOKUP_FAILED')
  }

  return data as Product | null
}

export async function updateProduct(
  productId: string,
  patch: UpdateProductInput
): Promise<Product> {
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (patch.name !== undefined) row.name = patch.name
  if (patch.base_price !== undefined) row.base_price = patch.base_price
  if (patch.category_id !== undefined) row.category_id = patch.category_id
  if (patch.description !== undefined) row.description = patch.description
  if (patch.sku !== undefined) row.sku = patch.sku
  if (patch.compare_at_price !== undefined) row.compare_at_price = patch.compare_at_price
  if (patch.track_inventory !== undefined) row.track_inventory = patch.track_inventory
  if (patch.stock_qty !== undefined) row.stock_qty = patch.stock_qty
  if (patch.images !== undefined) row.images = patch.images
  if (patch.thumbnail_url !== undefined) row.thumbnail_url = patch.thumbnail_url
  if (patch.is_active !== undefined) row.is_active = patch.is_active
  if (patch.sort_order !== undefined) row.sort_order = patch.sort_order
  if (patch.metadata !== undefined) row.metadata = patch.metadata

  const { data, error } = await supabaseAdmin
    .from('products')
    .update(row)
    .eq('id', productId)
    .select()
    .single()

  if (error) {
    throw new AppError(400, error.message, 'PRODUCT_UPDATE_FAILED')
  }

  return data as Product
}
