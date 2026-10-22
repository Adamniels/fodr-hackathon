import type { NutrientValues } from './nutrients'

export type Hasttyp = 'lattfodd' | 'normalfodd' | 'svarfodd'
export type Kon = 'sto' | 'valack' | 'hingst'
export type Grovfodertyp = 'hosilage' | 'ho'
/** How the horse usually reacts to feed changes. Sets how slowly the plan phases in the new feed. */
export type Bytekanslighet = 'tal' | 'normal' | 'kanslig'

/** A fixed work level per SLU table 9, used when the riding sessions are not described in detail. */
export type Arbetsniva = 'ingen' | 'latt' | 'medel' | 'hart' | 'mycket_hart'

/**
 * Discipline and level. Sets the work supplement when it is higher than the sessions give (SLU tables 9–11),
 * and the vitamin requirement for horses in hard work (table 18).
 */
export type Prestanda = 'fritid' | 'tavling_lokal' | 'tavling_hog' | 'trav_galopp_traning' | 'distans'

export interface Miljo {
  hallning: 'box' | 'losdrift'
  timmarUtePerDag: number
  klippt: boolean
  tacke: boolean
  /** Lowest daily mean temperature during the period, °C. */
  lagstaTempC: number
}

/** Ingredients that can be derived from the products' names and descriptions (scripts/import-products.mjs). */
// eslint-disable-next-line no-restricted-syntax -- stored identifiers and AI schema values (ADR 0016 rule 7), not text
export const INGREDIENSER = ['spannmål', 'lusern', 'soja', 'melass', 'linfrö', 'betfiber'] as const
export type Ingrediens = (typeof INGREDIENSER)[number]

export interface Halsa {
  fang: boolean
  ems: boolean
  /** PPID (Cushing's) is treated like EMS: low sugar and starch. */
  ppid?: boolean
  magsar?: boolean
  /** Tying-up, PSSM. */
  pssm?: boolean
  /** Respiratory problems or dust sensitivity. */
  luftvagar?: boolean
  tandproblem?: boolean
  proteinkanslig?: boolean
  undvik?: Ingrediens[]
  ovrigt: string
}

export interface Ridning {
  passPerVecka: number
  minuterPerPass: number
  /** Minutes of trot and canter per session; the rest counts as walk. */
  travGaloppMinPerPass: number
}

export interface NuvarandeFoder {
  /** ID in the product database, or null for a feed we don't know. */
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
  /** Measured or estimated weight in kg. */
  viktKg: number
  /** Body condition score 1–9 per SLU table 1. */
  hull: number
  /** Weight at normal condition, if the owner knows it. Otherwise it is estimated from the condition. */
  viktVidNormalHullKg?: number
  /** Id i rasregistret (breeds.ts). */
  ras?: string
  ridning?: Ridning
  arbetsniva?: Arbetsniva
  prestanda?: Prestanda
  miljo?: Miljo
  halsa: Halsa
  /** Sensitivity to feed changes. When missing, it is preselected from the health (domain/transition.ts). */
  bytekanslighet?: Bytekanslighet
  grovfoder: {
    typ: Grovfodertyp
    kgPerDag: number
  }
  nuvarandeFoder: NuvarandeFoder[]
}

export type Kalla = 'analys' | 'schablon' | 'okand'

/** A read roughage analysis. Contents per kg dry matter. */
export interface Grovfoderanalys {
  typ: Grovfodertyp
  labb?: string
  provdatum?: string
  tsProcent: number
  /** Crude ash, g/kg DM. Used to detect soil contamination. */
  askaGPerKgTs?: number
  perKgTs: NutrientValues
}

/** 'ovrigt' is e.g. stomach, joint and calming supplements and licks: counted in today's feed but never chosen. */
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
  /** The manufacturer's recommended dose, grams per 100 kg body weight and day. Required by the selection. */
  dosGramPer100kg?: { min: number; max: number }
  /** The manufacturer's text the dose is converted from. */
  dosKalla?: string
  /** Whether the selection may suggest the product. Set by scripts/produktval.json. */
  iUrval: boolean
  /**
   * Whether an admin has checked the declaration (perKg, naringsdata) against the package (CF9, #36). The selection
   * chooses only checked products; scripts/produktval.json sets it for the products it makes selectable.
   */
  deklarationKontrollerad?: boolean
  /** False when sugar plus starch is high, or unknown for a concentrate. */
  lampligVidFangEms: boolean
  /** Derived from the name and description, e.g. 'melass', 'lusern', 'soja', 'spannmål'. */
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
