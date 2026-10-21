import { NUTRIENT_KEYS, type NutrientKey, type NutrientValues } from './nutrients'
import { hittaSchablon } from './forage'
import type { Grovfoderanalys, Kalla, Produkt } from './types'

export interface IntagsVarde {
  varde: number
  /** Sämsta källan bland bidragen: okänd > schablon > analys. */
  kalla: Kalla
  /** Källtext för grovfoderbidraget när det är en schablon. */
  schablonKalla?: string
}

export type Intag = Record<NutrientKey, IntagsVarde>

export interface Foderpost {
  produkt: Produkt
  gramPerDag: number
}

/** Grovfodrets bidrag per dag. Saknade värden fylls med schablon, annars blir de okända. */
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
 * Lägger till produkter. En produkt som inte deklarerar ett ämne räknas som noll för det ämnet,
 * eftersom en foderdeklaration anger det som är tillsatt.
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

export function monthlyCost(produkt: Produkt, gramPerDag: number): number {
  const krPerKg = produkt.prisKr / produkt.forpackningKg
  return ((gramPerDag * 30) / 1000) * krPerKg
}

/** Produktnamn utan butikens kategoriprefix, t.ex. "Hästfoder Pavo SportsFit 15kg" blir "Pavo SportsFit 15kg". */
export function displayName(produkt: Produkt): string {
  return produkt.namn.replace(/^(Hästfoder|Mineralfoder|Fodertillskott|Foderråvara|Kompletteringsfoder)\s+/, '')
}
