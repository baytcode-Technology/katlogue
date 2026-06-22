export function formatMonthlyOrderNumber(numberPrefix: string, sequence: number): string {
  return `${numberPrefix}-${sequence}`
}

export function parseMonthlyOrderSequence(
  orderNumber: string,
  numberPrefix: string
): number | null {
  const expectedPrefix = `${numberPrefix}-`
  if (!orderNumber.startsWith(expectedPrefix)) return null
  const seq = Number.parseInt(orderNumber.slice(expectedPrefix.length), 10)
  return Number.isFinite(seq) && seq > 0 ? seq : null
}
