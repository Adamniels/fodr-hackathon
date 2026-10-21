import { NUTRIENT_KEYS, type NutrientKey, type NutrientValues } from './nutrients'
import { hittaSchablon } from './forage'
import type { Kallhanvisning } from './messages'
import type { Grovfoderanalys, Kalla, Produkt } from './types'

export interface IntagsVarde {
  varde: number
  /** The weakest source among the contributions: unknown > estimate > analysis. */
  kalla: Kalla
  /** The source of the roughage contribution when it is an estimate. */
  schablonKalla?: Kallhanvisning
}

export type Intag = Record<NutrientKey, IntagsVarde>

export interface Foderpost {
  produkt: Produkt
  gramPerDag: number
}

/** The roughage's contribution per day. Missing values are filled with an estimate, otherwise they are unknown. */
export function grovfoderIntag(analys: Grovfoderanalys, kgFoderPerDag: number): Intag {
  const kgTs = kgFoderPerDag * (analys.tsProcent / 100)
  const intag = {} as Intag
  for (const k of NUTRIENT_KEYS) {
    const analysVarde = analys.perKgTs[k]
    if (analysVarde !== undefined) {
      intag[k] = { varde: analysVarde * kgTs, kalla: 'analys' }
      continue
    }
    const s = hittaSchablon(analys.typ, k)
    intag[k] = s ? { varde: s.varde * kgTs, kalla: 'schablon', schablonKalla: s.kalla } : { varde: 0, kalla: 'okand' }
  }
  return intag
}

/**
 * Adds products. A product that does not declare a nutrient counts as zero for it,
 * since a feed declaration states what is added.
 */
export function laggTill(bas: Intag, poster: Foderpost[]): Intag {
  const ut = {} as Intag
  for (const k of NUTRIENT_KEYS) {
    const tillskott = poster.reduce((s, p) => s + ((p.produkt.perKg[k] ?? 0) * p.gramPerDag) / 1000, 0)
    ut[k] = { ...bas[k], varde: bas[k].varde + tillskott }
  }
  return ut
}

export function produktBidrag(produkt: Produkt, gramPerDag: number): NutrientValues {
  const ut: NutrientValues = {}
  for (const k of NUTRIENT_KEYS) {
    const v = produkt.perKg[k]
    if (v !== undefined) ut[k] = (v * gramPerDag) / 1000
  }
  return ut
}

/**
 * A dose at the precision the plan works and shows it in: whole grams, one decimal below 1 g (#103). The engine
 * compares doses this way, and the web shows them this way, so "Fortsätt" and "Ändra" match what the owner reads.
 */
export const roundDose = (g: number): number => (g < 1 ? Math.round(g * 10) / 10 : Math.round(g))

export function monthlyCost(produkt: Produkt, gramPerDag: number): number {
  const krPerKg = produkt.prisKr / produkt.forpackningKg
  return ((gramPerDag * 30) / 1000) * krPerKg
}

/** The product name without the store's category prefix: "Hästfoder Pavo SportsFit 15kg" is "Pavo SportsFit 15kg". */
export function displayName(produkt: Produkt): string {
  // eslint-disable-next-line no-restricted-syntax -- matches the stores' category prefixes in product data, not text
  return produkt.namn.replace(/^(Hästfoder|Mineralfoder|Fodertillskott|Foderråvara|Kompletteringsfoder)\s+/, '')
}
