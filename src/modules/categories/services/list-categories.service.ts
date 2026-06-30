import { assertStoreMember } from '../../stores/repositories/store.repository.js'
import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as categoryRepository from '../repositories/category.repository.js'
import type { Category, CategoryWithProductCount } from '../types/category.types.js'

export async function listCategoriesByStore(
  ownerId: string,
  storeId: number
): Promise<CategoryWithProductCount[]> {
  await assertStoreMember(storeId, ownerId)
  const categories = await categoryRepository.findCategoriesByStoreId(storeId)

  const { data: products, error } = await supabaseAdmin
    .from('products')
    .select('category_id')
    .eq('store_id', storeId)

  if (error) {
    throw new AppError(400, error.message, 'PRODUCT_COUNT_FAILED')
  }

  const counts = new Map<number, number>()
  for (const row of products ?? []) {
    const cid = row.category_id as number | null
    if (cid) {
      counts.set(cid, (counts.get(cid) ?? 0) + 1)
    }
  }

  return categories.map((category) => ({
    ...category,
    product_count: counts.get(category.id) ?? 0,
  }))
}
