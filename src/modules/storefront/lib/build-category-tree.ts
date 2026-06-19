import type { Category } from '../../categories/types/category.types.js'
import type { CatalogCategory } from '../types/catalog.types.js'

function sortCatalogCategories(nodes: CatalogCategory[]): void {
  nodes.sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  )
  for (const node of nodes) {
    sortCatalogCategories(node.subcategories)
  }
}

export function buildCatalogCategoryTree(categories: Category[]): CatalogCategory[] {
  const map = new Map<string, CatalogCategory>()
  const roots: CatalogCategory[] = []

  for (const category of categories) {
    map.set(category.id, { ...category, subcategories: [] })
  }

  for (const category of categories) {
    const node = map.get(category.id)
    if (!node) continue

    if (category.parent_id && map.has(category.parent_id)) {
      map.get(category.parent_id)!.subcategories.push(node)
    } else {
      roots.push(node)
    }
  }

  sortCatalogCategories(roots)
  return roots
}

export function collectCategoryIds(tree: CatalogCategory[]): Set<string> {
  const ids = new Set<string>()

  const walk = (nodes: CatalogCategory[]) => {
    for (const node of nodes) {
      ids.add(node.id)
      walk(node.subcategories)
    }
  }

  walk(tree)
  return ids
}
