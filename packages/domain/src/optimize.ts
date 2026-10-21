// Väljer billigaste kombination av mineralfoder, tillskott och salt som täcker brister utan att
// överskrida SLU:s maxgränser. Med 15–25 produkter är uttömmande sökning snabb, exakt nog och
// lätt att förklara, så ingen LP-lösare behövs.

import type { NutrientKey } from './nutrients'
import type { Behov } from './slu'
import { monthlyCost, laggTill, type Foderpost, type Intag } from './intake'
import type { Urvalshinder } from './messages'
import type { Produkt } from './types'

/** Ämnen som urvalet ska täcka. Energi och protein styrs via grovfoder och kraftfoder. */
export const URVALSAMNEN: NutrientKey[] = [
  'ca',
  'p',
  'mg',
  'na',
  'fe',
  'mn',
  'cu',
  'zn',
  'co',
  'jod',
  'se',
  'vitA',
  'vitD',
  'vitE',
  'b1',
  'b2',
  'biotin',
]
const MAXAMNEN: NutrientKey[] = [...URVALSAMNEN, 'starkelse']

const DOSSTEG = 12
const CA_P_MIN = 1.1 // SLU: kvoten bör aldrig understiga 1,1

/** A product the selection can dose: chosen for the selection and with a manufacturer's dose. */
type Doserbar = Produkt & { dosGramPer100kg: NonNullable<Produkt['dosGramPer100kg']> }

export interface Urval {
  poster: Foderpost[]
  kostnadPerManad: number
  intag: Intag
  /** Ämnen som fortfarande är under behovet, med andel av behovet (0–1). */
  kvarvarandeBrister: { amne: NutrientKey; andel: number }[]
  overMax: NutrientKey[]
  caP: number | null
}

/**
 * The best selection and an alternative, or why nothing can be added. The empty combination is always tried, so a
 * plan that needs no supplement gets a selection without products, never the hinder (C3).
 */
export type Urvalsutfall =
  { urval: Urval; alternativ: Urval | null; hinder: null } | { urval: null; alternativ: null; hinder: Urvalshinder }

export interface UrvalsIndata {
  /** Roughage and kept feeds: what every combination adds to. */
  bas: Intag
  /** The roughage alone, to tell an analysis value over a maximum from a kept feed pushing it over. */
  grovfoder: Intag
  behov: Behov
  produkter: Produkt[]
  berakningsviktKg: number
}

// SLU: Sverige har selenfattiga jordar och tillskott behövs i de allra flesta fall, och natrium finns
// inte i tillräcklig mängd i hästens naturliga föda. Makromineralerna styr alltid, även uppskattade,
// eftersom SLU säger att vallfoder bör analyseras för dem och behoven inte får underskridas.
// Vitamin E styr också: bete ingår inte i prototypen, så alla planer gäller stallfoderstat, och SLU anger
// att hösilage har 15–35 mg E per kg ts och att innehållet minskar under lagring (tabell 24).
const STYR_ALLTID: NutrientKey[] = ['ca', 'p', 'mg', 'na', 'se', 'vitE']

/**
 * Ämnen som urvalet måste täcka. Uppskattade mikromineraler och vitaminer styr inte: SLU anger att
 * vallfoder av god kvalitet ger tillräckligt av de flesta mikromineraler, och att hästar ute dagligen
 * normalt inte behöver extra vitaminer. Okänd tillförsel kan aldrig bedömas.
 */
export function styrandeAmnen(bas: Intag, behov: Behov): NutrientKey[] {
  return URVALSAMNEN.filter(
    (k) =>
      behov[k]?.min !== undefined && bas[k].kalla !== 'okand' && (bas[k].kalla === 'analys' || STYR_ALLTID.includes(k)),
  )
}

function utvardera(intag: Intag, behov: Behov, amnen: NutrientKey[]) {
  const brister: { amne: NutrientKey; andel: number }[] = []
  for (const k of amnen) {
    // Steering nutrients all have a minimum (styrandeAmnen keeps only those).
    const min = behov[k]?.min
    if (min === undefined) continue
    if (intag[k].varde < min - 1e-9) brister.push({ amne: k, andel: intag[k].varde / min })
  }
  const overMax = MAXAMNEN.filter((k) => {
    const max = behov[k]?.max
    return max !== undefined && intag[k].varde > max + 1e-9
  })
  const caP = intag.p.varde > 0 ? intag.ca.varde / intag.p.varde : null
  const bristpoang = brister.reduce((s, b) => s + (1 - b.andel), 0)
  return { brister, overMax, caP, bristpoang }
}

function doser(produkt: Doserbar, viktKg: number): number[] {
  const dos = produkt.dosGramPer100kg
  const min = dos.min * (viktKg / 100)
  const max = dos.max * (viktKg / 100)
  if (max - min < 1) return [Math.round(min)]
  return Array.from({ length: DOSSTEG + 1 }, (_, i) => Math.round(min + ((max - min) * i) / DOSSTEG))
}

/** Saltgiva som täcker natriumbristen, inom saltproduktens dosintervall. */
function saltPost(intag: Intag, behov: Behov, salt: Produkt | undefined, viktKg: number): Foderpost | null {
  const min = behov.na?.min
  const naPerKg = salt?.perKg.na
  if (!salt || min === undefined || !naPerKg || intag.na.varde >= min) return null
  const gram = Math.ceil(((min - intag.na.varde) / naPerKg) * 1000)
  const maxGram = (salt.dosGramPer100kg?.max ?? 0) * (viktKg / 100)
  return { produkt: salt, gramPerDag: Math.min(gram, Math.round(maxGram)) }
}

export function valjProdukter(input: UrvalsIndata): Urvalsutfall {
  const { bas, behov, berakningsviktKg: vikt } = input
  // Produkterna är redan filtrerade efter hästens känsligheter (sensitivity.ts).
  const valbara = input.produkter.filter((p): p is Doserbar => p.iUrval && p.dosGramPer100kg !== undefined)
  const kandidater = valbara.filter((p) => p.kategori === 'mineralfoder' || p.kategori === 'tillskott')
  const salt = valbara
    .filter((p) => p.kategori === 'salt')
    .sort((a, b) => a.prisKr / a.forpackningKg - b.prisKr / b.forpackningKg)[0]
  const amnen = styrandeAmnen(bas, behov)

  // Kombinationer: ingen produkt, en produkt, eller två produkter med högst ett mineralfoder.
  const kombinationer: Doserbar[][] = [[]]
  for (let i = 0; i < kandidater.length; i++) {
    kombinationer.push([kandidater[i]])
    for (let j = i + 1; j < kandidater.length; j++) {
      const par = [kandidater[i], kandidater[j]]
      if (par.filter((p) => p.kategori === 'mineralfoder').length <= 1) kombinationer.push(par)
    }
  }

  type Kandidat = Urval & { bristpoang: number }
  const basta: Kandidat[] = []
  // What the roughage and kept feeds exceed on their own, with salt only as the empty combination adds it.
  let overskridnaUtanTillskott: NutrientKey[] = []

  for (const kombo of kombinationer) {
    const dosRutnat = kombo.map((p) => doser(p, vikt))
    // Assigned in the closure below, which narrowing does not follow; without the cast it reads as always null.
    let bastIKombo = null as Kandidat | null
    const iterera = (idx: number, valda: Foderpost[]) => {
      if (idx < kombo.length) {
        for (const g of dosRutnat[idx]) iterera(idx + 1, [...valda, { produkt: kombo[idx], gramPerDag: g }])
        return
      }
      let poster = valda
      let intag = laggTill(bas, poster)
      const s = saltPost(intag, behov, salt, vikt)
      if (s) {
        poster = [...poster, s]
        intag = laggTill(bas, poster)
      }
      const e = utvardera(intag, behov, amnen)
      if (kombo.length === 0) overskridnaUtanTillskott = e.overMax
      if (e.overMax.length > 0) return
      if (e.caP !== null && e.caP < CA_P_MIN) return
      const kostnad = poster.reduce((sum, p) => sum + monthlyCost(p.produkt, p.gramPerDag), 0)
      const kandidat: Kandidat = {
        poster,
        kostnadPerManad: kostnad,
        intag,
        kvarvarandeBrister: e.brister,
        overMax: e.overMax,
        caP: e.caP,
        bristpoang: e.bristpoang,
      }
      if (!bastIKombo || battre(kandidat, bastIKombo)) bastIKombo = kandidat
    }
    iterera(0, [])
    if (bastIKombo) basta.push(bastIKombo)
  }

  basta.sort((a, b) => (battre(a, b) ? -1 : battre(b, a) ? 1 : 0))
  const urvalen = basta.map((k): Urval => ({
    poster: k.poster,
    kostnadPerManad: k.kostnadPerManad,
    intag: k.intag,
    kvarvarandeBrister: k.kvarvarandeBrister,
    overMax: k.overMax,
    caP: k.caP,
  }))
  // basta is empty when nothing fits (C3), so the first selection may be missing.
  const forsta = urvalen.length > 0 ? urvalen[0] : undefined
  const andra = urvalen.length > 1 ? urvalen[1] : undefined
  if (forsta) return { urval: forsta, alternativ: andra ?? null, hinder: null }
  const nutrients = overskridnaUtanTillskott
  const franGrovfodret = nutrients.every((k) => {
    // These nutrients exceeded a maximum, so they have one.
    const max = behov[k]?.max
    return max !== undefined && input.grovfoder[k].varde > max + 1e-9
  })
  return {
    urval: null,
    alternativ: null,
    hinder: !nutrients.length
      ? { code: 'infeasible.caP', params: { minRatio: CA_P_MIN } }
      : franGrovfodret
        ? { code: 'infeasible.roughageOverMax', params: { nutrients } }
        : { code: 'infeasible.overMax', params: { nutrients } },
  }
}

/** Full täckning går först, sedan minst brist, sedan lägst kostnad, sedan färst produkter. */
function battre(a: { bristpoang: number; kostnadPerManad: number; poster: Foderpost[] }, b: typeof a): boolean {
  const eps = 1e-6
  if (Math.abs(a.bristpoang - b.bristpoang) > eps) return a.bristpoang < b.bristpoang
  if (Math.abs(a.kostnadPerManad - b.kostnadPerManad) > 0.5) return a.kostnadPerManad < b.kostnadPerManad
  return a.poster.length < b.poster.length
}
