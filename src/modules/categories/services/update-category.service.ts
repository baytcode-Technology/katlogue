import { AppError } from '../../../shared/errors/app.error.js'
import { assertStoreOwner } from '../../stores/repositories/store.repository.js'
import * as categoryRepository from '../repositories/category.repository.js'
import type { Category, UpdateCategoryInput } from '../types/category.types.js'

export async function updateCategory(
  ownerId: string,
  categoryId: string,
  input: UpdateCategoryInput
): Promise<Category> {
  const existing = await categoryRepository.findCategoryById(categoryId)

  if (!existing) {
    throw new AppError(404, 'Category not found', 'CATEGORY_NOT_FOUND')
  }

  await assertStoreOwner(existing.store_id, ownerId)

  return categoryRepository.updateCategory(categoryId, input)
}
