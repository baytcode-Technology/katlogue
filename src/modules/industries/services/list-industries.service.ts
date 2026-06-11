import * as industryRepository from '../repositories/industry.repository.js'
import type { IndustryGroup } from '../types/industry.types.js'

export async function listIndustryGroups(): Promise<IndustryGroup[]> {
  const rows = await industryRepository.listActiveIndustries()
  const parents = rows.filter((row) => row.parent_id === null)
  const childrenByParent = new Map<string, IndustryGroup['children']>()

  for (const row of rows) {
    if (!row.parent_id) continue
    const list = childrenByParent.get(row.parent_id) ?? []
    list.push({ id: row.id, name: row.name, slug: row.slug })
    childrenByParent.set(row.parent_id, list)
  }

  return parents.map((parent) => ({
    id: parent.id,
    name: parent.name,
    slug: parent.slug,
    children: childrenByParent.get(parent.id) ?? [],
  }))
}
