import { NUTRIENTS, type NutrientKey } from './domain/nutrients'

export function tal(n: number | undefined, decimaler?: number): string {
  if (n === undefined || Number.isNaN(n)) return '–'
  const d = decimaler ?? (Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : Math.abs(n) >= 1 ? 1 : 2)
  return n.toLocaleString('sv-SE', { maximumFractionDigits: d, minimumFractionDigits: 0 })
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

/** Kort produktnamn för boxkortet: utan kategoriord först och förpackningsstorlek sist. */
export function kortProduktnamn(namn: string): string {
  return namn
    .replace(/^(Mineralfoder|Fodertillskott|Hästfoder)\s+/i, '')
    .replace(/\s+\d+(?:[,.]\d+)?\s*(?:kg|g|l|ml)$/i, '')
}
