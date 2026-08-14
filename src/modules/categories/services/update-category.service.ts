import { AppError } from '../../../shared/errors/app.error.js'
import { assertStoreMember } from '../../stores/repositories/store.repository.js'
import * as categoryRepository from '../repositories/category.repository.js'
import type { Category, UpdateCategoryInput } from '../types/category.types.js'

function collectDescendantIds(rootId: number, categories: Category[]): Set<number> {
  const byParent = new Map<number, number[]>()
  for (const c of categories) {
    if (c.parent_id == null) continue
    const list = byParent.get(c.parent_id) ?? []
    list.push(c.id)
    byParent.set(c.parent_id, list)
  }

  const result = new Set<number>()
  const stack = [...(byParent.get(rootId) ?? [])]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (result.has(id)) continue
    result.add(id)
    stack.push(...(byParent.get(id) ?? []))
  }
  return result
}

export async function updateCategory(
  ownerId: string,
  categoryId: number,
  input: UpdateCategoryInput
): Promise<Category> {
  const existing = await categoryRepository.findCategoryById(categoryId)

  if (!existing) {
    throw new AppError(404, 'Category not found', 'CATEGORY_NOT_FOUND')
  }

  await assertStoreMember(existing.store_id, ownerId)

  if (input.parent_id !== undefined) {
    if (input.parent_id === categoryId) {
      throw new AppError(
        400,
        'A category cannot be its own parent',
        'INVALID_PARENT_CATEGORY'
      )
    }

    if (input.parent_id != null) {
      await categoryRepository.assertParentCategory(input.parent_id, existing.store_id)

      const siblings = await categoryRepository.findCategoriesByStoreId(existing.store_id)
      const descendants = collectDescendantIds(categoryId, siblings)
      if (descendants.has(input.parent_id)) {
        throw new AppError(
          400,
          'Cannot move a category under one of its subcategories',
          'INVALID_PARENT_CATEGORY'
        )
      }
    }
  }

  return categoryRepository.updateCategory(categoryId, input)
}
