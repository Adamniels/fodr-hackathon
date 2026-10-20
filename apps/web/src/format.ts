import { NUTRIENTS, type NutrientKey } from '@fodr/domain/nutrients'
import i18n, { locale } from './i18n'

export function tal(n: number | undefined, decimaler?: number): string {
  if (n === undefined || Number.isNaN(n)) return '–'
  const d = decimaler ?? (Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : Math.abs(n) >= 1 ? 1 : 2)
  return n.toLocaleString(locale(), { maximumFractionDigits: d, minimumFractionDigits: 0 })
}

/** A decimal number as typed: digits with an optional comma or point, which may still be unfinished ("39,"). */
const DECIMAL = /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/

/**
 * Reads a number typed with a decimal comma or point. Returns undefined for empty or non-numeric text, never 0,
 * because a missing value is unknown.
 */
export function parseDecimal(text: string): number | undefined {
  const t = text.trim()
  if (!DECIMAL.test(t)) return undefined
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

/** Whole kronor. Rounded first, so halves round as Math.round does (Intl alone rounds them away from zero). */
export const kr = (n: number) =>
  new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency: 'SEK',
    // Both bounds: engines before Intl.NumberFormat v3 (Safari < 15.4) throw when max is below SEK's default min of 2.
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n))

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Reads a stored date ("2026-06-05") as local midnight of that calendar day. new Date(text) would read it as UTC
 * midnight, which is the previous day in time zones behind UTC. Returns undefined for anything that is not a real
 * calendar date, never a fallback date.
 */
export function parseIsoDate(text: string): Date | undefined {
  const m = ISO_DATE.exec(text)
  if (!m) return undefined
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  // The Date constructor rolls invalid days over (Feb 30 becomes Mar 2); a real date reads back unchanged.
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : undefined
}

/** A stored date for the active locale ("2026-06-05" in sv-SE). Text that is not a valid date is shown as it is. */
export function formatDate(iso: string): string {
  return parseIsoDate(iso)?.toLocaleDateString(locale(), { dateStyle: 'short' }) ?? iso
}

export const etikett = (k: NutrientKey) => NUTRIENTS[k].label
export const enhet = (k: NutrientKey) => NUTRIENTS[k].unit

/** Enhet per kg ts för analysvärden. */
export function analysEnhet(k: NutrientKey): string {
  return i18n.t('units.perKgDm', { unit: NUTRIENTS[k].unit })
}

/** SLU's body condition scale. */
export const HULL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
type HullLevel = (typeof HULL_LEVELS)[number]

const isHullLevel = (n: number): n is HullLevel => (HULL_LEVELS as readonly number[]).includes(n)

/** The description of a body condition score, or undefined outside the scale. */
export function hullText(n: number): string | undefined {
  return isHullLevel(n) ? i18n.t(`hull.${n}`) : undefined
}
