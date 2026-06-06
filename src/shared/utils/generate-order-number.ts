const MONTH_ABBREV = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const

export type MonthBounds = {
  prefix: (typeof MONTH_ABBREV)[number]
  /** 2-digit UTC year, e.g. "26" for 2026 */
  yearSuffix: string
  /** e.g. "FEB26" — used in order numbers and DB filters */
  numberPrefix: string
  start: string
  end: string
}

export function getCurrentMonthBounds(date: Date = new Date()): MonthBounds {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const prefix = MONTH_ABBREV[month]
  const yearSuffix = String(year).slice(-2)
  return {
    prefix,
    yearSuffix,
    numberPrefix: `${prefix}${yearSuffix}`,
    start: new Date(Date.UTC(year, month, 1)).toISOString(),
    end: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  }
}

/** e.g. FEB26-1 (month + 2-digit year + sequence) */
export function formatMonthlyOrderNumber(numberPrefix: string, sequence: number): string {
  return `${numberPrefix}-${sequence}`
}

/** Parse "FEB26-12" or legacy "FEB-12" → sequence; 0 if not matching. */
export function parseMonthlyOrderSequence(orderNumber: string): number {
  const trimmed = orderNumber.trim()
  const withYear = trimmed.match(/^[A-Z]{3}\d{2}-(\d+)$/i)
  if (withYear) {
    const n = Number.parseInt(withYear[1], 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const legacy = trimmed.match(/^[A-Z]{3}-(\d+)$/i)
  if (legacy) {
    const n = Number.parseInt(legacy[1], 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  return 0
}
