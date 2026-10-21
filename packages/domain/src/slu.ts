// Behovsberäkning för vuxna hästar enligt SLU Rapport 289, Utfodringsrekommendationer för häst
// (Jansson red., 7:e upplagan 2013). Tabellnummer i kommentarerna avser den rapporten.
// Antaganden som inte kommer från SLU är märkta ANTAGANDE.

import { DomainError, type Kallhanvisning, type Notering, type SluNiva } from './messages'
import { NA_PER_NACL, type NutrientKey } from './nutrients'
import { hittaRas } from './breeds'
import type { Arbetsniva, Hastprofil, Prestanda } from './types'

export interface Krav {
  min?: number
  max?: number
  kalla: Kallhanvisning
}

export type Behov = Partial<Record<NutrientKey, Krav>>

export interface Behovsresultat {
  behov: Behov
  /** Vikt som behoven räknas på, dvs vikt vid normalt hull (SLU tabell 3, not). */
  berakningsviktKg: number
  underhallMJ: number
  arbetsMJ: number
  kylaMJ: number
  /** Arbetstillägg i procent av underhållsbehovet, styr val av mineralrad. */
  arbetsProcent: number
  /** Rekommenderad grovfodergiva i kg ts per dag. */
  grovfoderKgTs: { minimum: number; rekommenderatMin: number; rekommenderatMax: number }
  noteringar: Notering[]
}

const TYPFAKTOR = { lattfodd: 1.0, normalfodd: 1.05, svarfodd: 1.1 } as const // Tabell 3

const ARBETE_PROCENT: Record<Arbetsniva, number> = {
  // Tabell 9
  ingen: 0,
  latt: 25,
  medel: 50,
  hart: 75,
  mycket_hart: 120,
}

// ANTAGANDE: ungefär 4 % viktskillnad per hullpoäng från normalt hull (5). SLU anger att behovet
// ska räknas på vikten vid normalt hull men ger ingen omräkning. Ägaren kan ange vikten själv.
const VIKT_PER_HULLPOANG = 0.04

export function viktVidNormalHull(p: Hastprofil): number {
  if (p.viktVidNormalHullKg) return p.viktVidNormalHullKg
  if (p.hull > 5) return p.viktKg * (1 - VIKT_PER_HULLPOANG * (p.hull - 5))
  if (p.hull < 4) return p.viktKg * (1 + VIKT_PER_HULLPOANG * (4 - p.hull))
  return p.viktKg
}

/** Sid 35, formel 2: bröstomfång² × längd / 8900 (cm in, kg ut). */
export function viktFranBrostomfang(brostomfangCm: number, langdCm: number): number {
  return (brostomfangCm ** 2 * langdCm) / 8900
}

/** Sid 35, formel 1: 4,3 × lansmärkesomfång + 3,0 × mankhöjd − 785. */
export function viktFranLansmarke(lansmarkeCm: number, mankhojdCm: number): number {
  return 4.3 * lansmarkeCm + 3.0 * mankhojdCm - 785
}

/** Tabell 11: ridträning, MJ per dag, räknat på aktuell vikt. */
function arbetsMJFranRidning(p: Hastprofil): number {
  const r = p.ridning!
  const passPerDag = r.passPerVecka / 7
  const travMin = r.travGaloppMinPerPass * passPerDag
  const skrittMin = Math.max(0, r.minuterPerPass - r.travGaloppMinPerPass) * passPerDag
  const per100kg = 0.2 * (skrittMin / 10) + 1.3 * (travMin / 10)
  return per100kg * (p.viktKg / 100)
}

/** Lägsta arbetstillägg för gren och nivå, i MJ per dag. */
function prestandaMinimumMJ(prestanda: Prestanda, underhallMJ: number, viktKg: number): number {
  switch (prestanda) {
    case 'fritid':
      return 0
    case 'tavling_lokal':
      return 0.4 * underhallMJ // Tabell 10: skolhäst med tävling 1–2 ggr/mån, 40–50 %
    case 'tavling_hog':
      return 0.75 * underhallMJ // Tabell 9: hårt arbete
    case 'trav_galopp_traning':
      return 11 * (viktKg / 100) // Tabell 11: träning med flera snabbjobb per vecka, 11–16 MJ/100 kg
    case 'distans':
      return 1.2 * underhallMJ // Tabell 9: mycket hårt arbete
  }
}

// ANTAGANDE: SLU:s kylatillägg (regel 1, sid 15) gäller hästar på underhållsfoderstat. Vi tillämpar
// det upp till lätt arbete, eftersom arbetet i sig ger värme.
const KYLA_MAX_ARBETSPROCENT = 25
const KYLA_GRANS_C = -15
const KYLA_PER_GRAD = 0.027
// ANTAGANDE: "ute större delen av dygnet" tolkas som minst 12 timmar eller lösdrift.
const UTE_STORRE_DELEN_H = 12

/** Tabell 15, rad efter arbetstillägg. Värden i g per 100 kg och dag; NaCl räknas om till Na. */
function makroPer100kg(arbetsProcent: number): { ca: number; p: number; mg: number; nacl: number; rad: SluNiva } {
  if (arbetsProcent <= 0) return { ca: 4.0, p: 2.8, mg: 1.5, nacl: 5.1, rad: 'underhall' }
  if (arbetsProcent < 30) return { ca: 6.0, p: 3.6, mg: 1.9, nacl: 7, rad: 'arbeteUnder30' }
  if (arbetsProcent < 50) return { ca: 7.0, p: 4.2, mg: 2.3, nacl: 9, rad: 'arbete30to50' }
  if (arbetsProcent < 75) return { ca: 8.0, p: 5.8, mg: 3.0, nacl: 9, rad: 'arbete50to75' }
  return { ca: 8.0, p: 5.8, mg: 3.0, nacl: 13, rad: 'arbete75to130' }
}

// Tabell 17, mg per 100 kg och dag. Nedre gränsen i SLU:s intervall används som minimum.
const MIKRO = {
  fe: { underhall: 40, arbete: 80, max: 3000 },
  mn: { underhall: 40, arbete: 80, max: 3000 },
  cu: { underhall: 10, arbete: 20, max: 2400 },
  zn: { underhall: 40, arbete: 80, max: 1500 },
  co: { underhall: 0.1, arbete: 0.2, max: 30 },
  jod: { underhall: 0.35, arbete: 0.35, max: 10 },
  se: { underhall: 0.2, arbete: 0.2, max: 5 },
} as const

// ANTAGANDE: tabell 17:s kolumn "Arbete" används från lätt arbete (25 % tillägg) och uppåt.
const MIKRO_ARBETE_FRAN_PROCENT = 25

// Tabell 18, per 100 kg och dag. "Hårt arbetande" avser trav, galopp, fälttävlan och distans.
const VITAMIN = {
  vitA: { normal: 3000, hart: 7500, max: 48000 },
  vitD: { normal: 400, hart: 750, max: 6600 },
  vitE: { normal: 75, hart: 200, max: 3000 },
  b1: { normal: 6, hart: 9, max: 9000 },
  b2: { normal: 4, hart: 6, max: undefined },
  biotin: { normal: 0.1, hart: 0.15, max: undefined },
} as const

/** The model covers adult horses only. */
const MIN_ALDER_AR = 3

export function beraknaBehov(p: Hastprofil): Behovsresultat {
  if (p.alderAr < MIN_ALDER_AR) {
    throw new DomainError({ code: 'error.adultsOnly', params: { minAgeYears: MIN_ALDER_AR } })
  }
  const noteringar: Notering[] = []
  const vikt = viktVidNormalHull(p)
  const per100 = vikt / 100
  if (Math.abs(vikt - p.viktKg) > 1) {
    noteringar.push({ code: 'note.normalConditionWeight', params: { kg: vikt } })
  }

  // Underhåll, tabell 3: 0,5 × V^0,75 för lättfödda, +5 % normalfödda, +10 % svårfödda.
  const underhallMJ = 0.5 * vikt ** 0.75 * TYPFAKTOR[p.typ]
  const hingstMJ = p.kon === 'hingst' ? 0.1 * underhallMJ : 0

  const franPass = p.ridning ? arbetsMJFranRidning(p) : (ARBETE_PROCENT[p.arbetsniva ?? 'ingen'] / 100) * underhallMJ
  const prestandaMJ = p.prestanda ? prestandaMinimumMJ(p.prestanda, underhallMJ, p.viktKg) : 0
  const arbetsMJ = Math.max(franPass, prestandaMJ)
  if (prestandaMJ > franPass) {
    noteringar.push({ code: 'note.workFromDiscipline', params: {} })
  }
  const arbetsProcent = (arbetsMJ / underhallMJ) * 100

  if (p.prestanda === 'trav_galopp_traning' || p.prestanda === 'distans' || p.prestanda === 'tavling_hog') {
    noteringar.push({ code: 'note.sweatSalt', params: {} })
  }

  let kylaMJ = 0
  const m0 = p.miljo
  if (m0) {
    const uteMesta = m0.hallning === 'losdrift' || m0.timmarUtePerDag >= UTE_STORRE_DELEN_H
    const exponerad = uteMesta && !m0.klippt && !m0.tacke
    const grader = KYLA_GRANS_C - m0.lagstaTempC
    if (exponerad && grader > 0) {
      if (arbetsProcent <= KYLA_MAX_ARBETSPROCENT) {
        kylaMJ = KYLA_PER_GRAD * grader * underhallMJ
        noteringar.push({ code: 'note.coldSupplement', params: { mj: kylaMJ, degreesBelow: grader } })
      } else {
        noteringar.push({ code: 'note.coldWorking', params: {} })
      }
    }
    if (m0.hallning === 'losdrift') {
      noteringar.push({ code: 'note.looseHousing', params: {} })
    }
  }

  const ras = hittaRas(p.ras)
  if (ras?.viktKg && (p.viktKg < ras.viktKg.min * 0.9 || p.viktKg > ras.viktKg.max * 1.1)) {
    noteringar.push({
      code: 'note.weightOutsideBreed',
      params: { kg: p.viktKg, breedId: ras.id, minKg: ras.viktKg.min, maxKg: ras.viktKg.max },
    })
  }

  if (p.alderAr >= 20) {
    noteringar.push({ code: 'note.senior', params: {} })
  }

  const energi = underhallMJ + hingstMJ + arbetsMJ + kylaMJ
  // Vuxna: 6 g smb rp per MJ för underhåll, kön och arbete. Kyla kräver inget extra protein (SLU).
  const smbRp = 6 * (energi - kylaMJ)

  const m = makroPer100kg(arbetsProcent)
  const mikroKolumn = arbetsProcent >= MIKRO_ARBETE_FRAN_PROCENT ? 'arbete' : 'underhall'
  const hartArbete = arbetsProcent >= 75

  const behov: Behov = {
    energi: { min: energi, kalla: { code: 'source.energy', params: {} } },
    smbRp: { min: smbRp, kalla: { code: 'source.proteinPerMJ', params: {} } },
    ca: { min: m.ca * per100, kalla: { code: 'source.macroMinerals', params: { level: m.rad } } },
    p: { min: m.p * per100, kalla: { code: 'source.macroMinerals', params: { level: m.rad } } },
    mg: { min: m.mg * per100, kalla: { code: 'source.macroMinerals', params: { level: m.rad } } },
    na: { min: m.nacl * NA_PER_NACL * per100, kalla: { code: 'source.sodium', params: { level: m.rad } } },
    // Riktlinjer för kraftfodergivan (sid 33): högst 500 g stärkelse per 100 kg och dag.
    starkelse: { max: 500 * per100, kalla: { code: 'source.concentrateGuidelines', params: {} } },
  }
  for (const [k, v] of Object.entries(MIKRO) as [keyof typeof MIKRO, (typeof MIKRO)[keyof typeof MIKRO]][]) {
    behov[k] = {
      min: v[mikroKolumn] * per100,
      max: v.max * per100,
      kalla: { code: 'source.microMinerals', params: { level: mikroKolumn } },
    }
  }
  for (const [k, v] of Object.entries(VITAMIN) as [keyof typeof VITAMIN, (typeof VITAMIN)[keyof typeof VITAMIN]][]) {
    behov[k] = {
      min: (hartArbete ? v.hart : v.normal) * per100,
      max: v.max === undefined ? undefined : v.max * per100,
      kalla: { code: 'source.vitamins', params: {} },
    }
  }

  return {
    behov,
    berakningsviktKg: vikt,
    underhallMJ,
    arbetsMJ,
    kylaMJ,
    arbetsProcent,
    // Riktlinjer för stråfodergivan: minst 1, helst 1,5–2,0 kg ts per 100 kg.
    grovfoderKgTs: { minimum: 1.0 * per100, rekommenderatMin: 1.5 * per100, rekommenderatMax: 2.0 * per100 },
    noteringar,
  }
}

/** Vallfoder: smb rp (g/kg ts) från råprotein (g/kg ts), sid 25. */
export function smbRpFranRaprotein(raproteinGPerKgTs: number): number {
  const procent = raproteinGPerKgTs / 10
  const dCP = 93.9 - 313 / procent
  return (dCP * raproteinGPerKgTs) / 100
}

/** Vallfoder: omsättbar energi för häst från idisslarvärde (MJ/kg ts), sid 25. */
export function energiHastFranIdisslare(mjIdisslare: number): number {
  return 1.12 * mjIdisslare - 1.1
}
