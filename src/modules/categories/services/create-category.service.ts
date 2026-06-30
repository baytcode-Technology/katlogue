import { assertStoreMember } from '../../stores/repositories/store.repository.js'
import * as categoryRepository from '../repositories/category.repository.js'
import type { Category, CreateCategoryInput } from '../types/category.types.js'

export async function createCategory(
  ownerId: string,
  input: CreateCategoryInput
): Promise<Category> {
  await assertStoreMember(input.store_id, ownerId)

  if (input.parent_id) {
    await categoryRepository.assertParentCategory(input.parent_id, input.store_id)
  }

  return categoryRepository.insertCategory(input)
}
