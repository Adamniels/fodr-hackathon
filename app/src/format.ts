import { NUTRIENTS, type NutrientKey } from './domain/nutrients'

export function tal(n: number | undefined, decimaler?: number): string {
  if (n === undefined || Number.isNaN(n)) return '–'
  const d = decimaler ?? (Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : Math.abs(n) >= 1 ? 1 : 2)
  return n.toLocaleString('sv-SE', { maximumFractionDigits: d, minimumFractionDigits: 0 })
}

/** A decimal number as typed: digits with an optional comma or point, which may still be unfinished ("39,"). */
const DECIMAL = /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/

/**
 * Reads a number typed with a decimal comma or point. Returns undefined for empty or non-numeric text, never 0,
 * because a missing value is unknown.
 */
export function parseDecimal(text: string): number | undefined {
  const t = text.trim()
  return DECIMAL.test(t) ? Number(t.replace(',', '.')) : undefined
}

export const kr = (n: number) => `${Math.round(n).toLocaleString('sv-SE')} kr`

export const etikett = (k: NutrientKey) => NUTRIENTS[k].label
export const enhet = (k: NutrientKey) => NUTRIENTS[k].unit

/** Enhet per kg ts för analysvärden. */
export function analysEnhet(k: NutrientKey): string {
  const u = NUTRIENTS[k].unit
  return `${u}/kg ts`
}

export const HULL_TEXT: Record<number, string> = {
  1: 'Extremt utmärglad',
  2: 'Mycket mager',
  3: 'Mager',
  4: 'Slank',
  5: 'Måttlig',
  6: 'Måttligt fet',
  7: 'Fet',
  8: 'Mycket fet',
  9: 'Extremt fet',
}
