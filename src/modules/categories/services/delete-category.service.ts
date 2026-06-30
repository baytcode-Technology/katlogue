import { AppError } from '../../../shared/errors/app.error.js'
import { assertStoreMember } from '../../stores/repositories/store.repository.js'
import * as categoryRepository from '../repositories/category.repository.js'

/**
 * Deletes a category. Products in this category keep their records;
 * `category_id` is cleared automatically (ON DELETE SET NULL).
 */
export async function deleteCategory(ownerId: string, categoryId: number): Promise<void> {
  const existing = await categoryRepository.findCategoryById(categoryId)

  if (!existing) {
    throw new AppError(404, 'Category not found', 'CATEGORY_NOT_FOUND')
  }

  await assertStoreMember(existing.store_id, ownerId)
  await categoryRepository.deleteCategory(categoryId)
}
