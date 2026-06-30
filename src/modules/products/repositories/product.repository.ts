import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { assertStoreMember } from '../../stores/repositories/store-staff.repository.js'
import type {
  CreateProductInput,
  Product,
  ProductStatus,
  UpdateProductInput,
} from '../types/product.types.js'

function resolveStatus(input: {
  status?: ProductStatus
  is_active?: boolean
}): ProductStatus {
  if (
    input.status === 'active' ||
    input.status === 'draft' ||
    input.status === 'unlisted'
  ) {
    return input.status
  }
  if (input.is_active === false) return 'draft'
  return 'active'
}

export async function assertStoreOwner(
  storeId: number,
  ownerId: string
): Promise<void> {
  await assertStoreMember(storeId, ownerId)
}

export async function assertCategoryBelongsToStore(
  categoryId: number,
  storeId: number
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
  const status = resolveStatus(input)
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
    mark_as_sold: input.mark_as_sold ?? false,
    mark_as_non_inventory: input.mark_as_non_inventory ?? false,
    images: input.images,
    thumbnail_url: input.thumbnail_url ?? null,
    status,
    is_active: status === 'active',
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

export async function findProductsByStoreId(storeId: number): Promise<Product[]> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    throw new AppError(400, error.message, 'PRODUCT_LIST_FAILED')
  }

  return (data ?? []) as Product[]
}

export async function findActiveProductsByStoreId(storeId: number): Promise<Product[]> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .eq('status', 'active')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new AppError(400, error.message, 'PRODUCT_LIST_FAILED')
  }

  return (data ?? []) as Product[]
}

export async function findProductsByIds(
  storeId: number,
  productIds: number[]
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

export async function findProductById(productId: number): Promise<Product | null> {
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
  productId: number,
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
  if (patch.mark_as_sold !== undefined) row.mark_as_sold = patch.mark_as_sold
  if (patch.mark_as_non_inventory !== undefined) {
    row.mark_as_non_inventory = patch.mark_as_non_inventory
  }
  if (patch.images !== undefined) row.images = patch.images
  if (patch.thumbnail_url !== undefined) row.thumbnail_url = patch.thumbnail_url
  if (patch.status !== undefined || patch.is_active !== undefined) {
    const status = resolveStatus({
      status: patch.status,
      is_active: patch.is_active,
    })
    row.status = status
    row.is_active = status === 'active'
  }
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

export async function adjustProductStock(productId: number, delta: number): Promise<void> {
  const product = await findProductById(productId)
  if (!product) {
    throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND')
  }

  const { error } = await supabaseAdmin
    .from('products')
    .update({
      stock_qty: product.stock_qty + delta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId)

  if (error) {
    throw new AppError(400, error.message, 'PRODUCT_STOCK_UPDATE_FAILED')
  }
}

export async function syncCategoryMembership(
  storeId: number,
  categoryId: number,
  productIds: number[]
): Promise<{ assigned: number; removed: number }> {
  const now = new Date().toISOString()

  if (productIds.length > 0) {
    const { error: assignError } = await supabaseAdmin
      .from('products')
      .update({ category_id: categoryId, updated_at: now })
      .eq('store_id', storeId)
      .in('id', productIds)

    if (assignError) {
      throw new AppError(400, assignError.message, 'CATEGORY_ASSIGN_FAILED')
    }
  }

  const { data: inCategory, error: listError } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('store_id', storeId)
    .eq('category_id', categoryId)

  if (listError) {
    throw new AppError(400, listError.message, 'CATEGORY_SYNC_FAILED')
  }

  const toRemove = (inCategory ?? [])
    .map((r) => r.id as number)
    .filter((id) => !productIds.includes(id))

  if (toRemove.length > 0) {
    const { error: removeError } = await supabaseAdmin
      .from('products')
      .update({ category_id: null, updated_at: now })
      .eq('store_id', storeId)
      .in('id', toRemove)

    if (removeError) {
      throw new AppError(400, removeError.message, 'CATEGORY_REMOVE_FAILED')
    }
  }

  return { assigned: productIds.length, removed: toRemove.length }
}

export async function countByStoreId(storeId: number): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)

  if (error) {
    throw new AppError(400, error.message, 'PRODUCT_COUNT_FAILED')
  }

  return count ?? 0
}
