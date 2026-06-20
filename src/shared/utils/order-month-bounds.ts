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
  yearSuffix: string
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
