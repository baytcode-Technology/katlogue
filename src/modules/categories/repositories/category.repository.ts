import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '../types/category.types.js'

export async function assertParentCategory(
  parentId: string,
  storeId: string
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id')
    .eq('id', parentId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'CATEGORY_LOOKUP_FAILED')
  }

  if (!data) {
    throw new AppError(
      400,
      'Parent category not found or does not belong to this store',
      'INVALID_PARENT_CATEGORY'
    )
  }
}

function mapUniqueViolation(error: { code?: string; message?: string }): never {
  const message = error.message ?? ''
  if (message.includes('slug')) {
    throw new AppError(409, 'A category with this slug already exists in this store', 'SLUG_EXISTS')
  }
  throw new AppError(409, 'Category already exists', 'CONFLICT')
}

export async function insertCategory(input: CreateCategoryInput): Promise<Category> {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .insert({
      store_id: input.store_id,
      name: input.name,
      slug: input.slug,
      parent_id: input.parent_id ?? null,
      image_url: input.image_url ?? null,
      sort_order: input.sort_order,
      is_active: input.is_active,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      mapUniqueViolation(error)
    }
    throw new AppError(400, error.message, 'CATEGORY_CREATE_FAILED')
  }

  return data as Category
}

export async function findCategoriesByStoreId(storeId: string): Promise<Category[]> {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('*')
    .eq('store_id', storeId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new AppError(400, error.message, 'CATEGORY_LIST_FAILED')
  }

  return (data ?? []) as Category[]
}

export async function findCategoryById(categoryId: string): Promise<Category | null> {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('*')
    .eq('id', categoryId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'CATEGORY_LOOKUP_FAILED')
  }

  return (data as Category | null) ?? null
}

export async function updateCategory(
  categoryId: string,
  patch: UpdateCategoryInput
): Promise<Category> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.slug !== undefined) row.slug = patch.slug
  if (patch.image_url !== undefined) row.image_url = patch.image_url
  if (patch.is_active !== undefined) row.is_active = patch.is_active
  if (patch.description !== undefined) row.description = patch.description
  if (patch.parent_id !== undefined) row.parent_id = patch.parent_id
  if (patch.sort_order !== undefined) row.sort_order = patch.sort_order

  const { data, error } = await supabaseAdmin
    .from('categories')
    .update(row)
    .eq('id', categoryId)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      mapUniqueViolation(error)
    }
    throw new AppError(400, error.message, 'CATEGORY_UPDATE_FAILED')
  }

  return data as Category
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('categories').delete().eq('id', categoryId)

  if (error) {
    throw new AppError(400, error.message, 'CATEGORY_DELETE_FAILED')
  }
}

export async function findActiveCategoriesByStoreId(storeId: string): Promise<Category[]> {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new AppError(400, error.message, 'CATEGORY_LIST_FAILED')
  }

  return (data ?? []) as Category[]
}
