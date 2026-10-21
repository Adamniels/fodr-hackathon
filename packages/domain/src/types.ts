import type { NutrientValues } from './nutrients'

export type Hasttyp = 'lattfodd' | 'normalfodd' | 'svarfodd'
export type Kon = 'sto' | 'valack' | 'hingst'
export type Grovfodertyp = 'hosilage' | 'ho'
/** Hur hästen brukar reagera på foderbyten. Styr hur långsamt planen trappar in det nya fodret. */
export type Bytekanslighet = 'tal' | 'normal' | 'kanslig'

/** Fast arbetsnivå enligt SLU tabell 9, används när ridpassen inte är beskrivna i detalj. */
export type Arbetsniva = 'ingen' | 'latt' | 'medel' | 'hart' | 'mycket_hart'

/**
 * Gren och nivå. Styr arbetstillägget när det är högre än vad ridpassen ger (SLU tabell 9–11),
 * samt vitaminbehovet för hårt arbetande hästar (tabell 18).
 */
export type Prestanda = 'fritid' | 'tavling_lokal' | 'tavling_hog' | 'trav_galopp_traning' | 'distans'

export interface Miljo {
  hallning: 'box' | 'losdrift'
  timmarUtePerDag: number
  klippt: boolean
  tacke: boolean
  /** Lägsta dygnsmedeltemperatur under perioden, °C. */
  lagstaTempC: number
}

/** Ingredients that can be derived from the products' names and descriptions (scripts/import-products.mjs). */
// eslint-disable-next-line no-restricted-syntax -- stored identifiers and AI schema values (ADR 0016 rule 7), not text
export const INGREDIENSER = ['spannmål', 'lusern', 'soja', 'melass', 'linfrö', 'betfiber'] as const
export type Ingrediens = (typeof INGREDIENSER)[number]

export interface Halsa {
  fang: boolean
  ems: boolean
  /** PPID (Cushings) behandlas som EMS: lågt socker och stärkelse. */
  ppid?: boolean
  magsar?: boolean
  /** Korsförlamning, PSSM. */
  pssm?: boolean
  /** Luftvägsbesvär eller dammkänslighet. */
  luftvagar?: boolean
  tandproblem?: boolean
  proteinkanslig?: boolean
  undvik?: Ingrediens[]
  ovrigt: string
}

export interface Ridning {
  passPerVecka: number
  minuterPerPass: number
  /** Minuter trav och galopp per pass, resten räknas som skritt. */
  travGaloppMinPerPass: number
}

export interface NuvarandeFoder {
  /** Id i produktdatabasen, eller null för ett foder vi inte känner till. */
  produktId: string | null
  namn: string
  gramPerDag: number
}

export interface Hastprofil {
  id: string
  namn: string
  alderAr: number
  kon: Kon
  typ: Hasttyp
  /** Uppmätt eller uppskattad vikt i kg. */
  viktKg: number
  /** Hullpoäng 1–9 enligt SLU tabell 1. */
  hull: number
  /** Vikt vid normalt hull, om ägaren vet den. Annars uppskattas den från hullet. */
  viktVidNormalHullKg?: number
  /** Id i rasregistret (breeds.ts). */
  ras?: string
  ridning?: Ridning
  arbetsniva?: Arbetsniva
  prestanda?: Prestanda
  miljo?: Miljo
  halsa: Halsa
  /** Känslighet för foderbyten. Saknas den förväljs den utifrån hälsan (domain/transition.ts). */
  bytekanslighet?: Bytekanslighet
  grovfoder: {
    typ: Grovfodertyp
    kgPerDag: number
  }
  nuvarandeFoder: NuvarandeFoder[]
}

export type Kalla = 'analys' | 'schablon' | 'okand'

/** Utläst grovfoderanalys. Halter per kg torrsubstans. */
export interface Grovfoderanalys {
  typ: Grovfodertyp
  labb?: string
  provdatum?: string
  tsProcent: number
  /** Råaska, g/kg ts. Används för att upptäcka jordinblandning. */
  askaGPerKgTs?: number
  perKgTs: NutrientValues
}

/** 'ovrigt' är t.ex. mag-, led- och lugnande tillskott samt slickstenar: räknas med i dagens foder men väljs aldrig. */
export type Produktkategori = 'mineralfoder' | 'tillskott' | 'salt' | 'kraftfoder' | 'proteinfoder' | 'ovrigt'

export interface Produkt {
  id: string
  namn: string
  marke: string
  kategori: Produktkategori
  /** Halter per kg foder, enligt produktens deklaration. */
  perKg: NutrientValues
  prisKr: number
  forpackningKg: number
  /** Tillverkarens rekommenderade dos, gram per 100 kg kroppsvikt och dag. Krävs för urvalet. */
  dosGramPer100kg?: { min: number; max: number }
  /** Tillverkarens text som dosen är omräknad från. */
  dosKalla?: string
  /** Om urvalet får föreslå produkten. Styrs av scripts/produktval.json. */
  iUrval: boolean
  /** False om socker plus stärkelse är högt eller okänt för kraftfoder. */
  lampligVidFangEms: boolean
  /** Härledda ur namn och beskrivning, t.ex. 'melass', 'lusern', 'soja', 'spannmål'. */
  ingredienser: string[]
  form?: string
  naringsdata: 'komplett' | 'delvis' | 'bara_ravarde' | 'saknas' | 'ej_relevant'
  kontrollera?: string[]
  antaganden: string[]
  butik: string
  url?: string
  kalla: string
  insamlad: string
}
