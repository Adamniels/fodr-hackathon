// Hästens journal: mätningar, iakttagelser och sparade planer över tid. Trend och påminnelser räknas
// här utan AI. AI:n läser journalen och letar mönster (apps/api/src/ai/anthropic.ts), men ändrar aldrig planen.

import { monthlyCost, type Foderpost } from './intake'
import type { Trendvarning } from './messages'
import type { Grovfoderanalys } from './types'

/** The analysis a plan was made from, as values: the web shows them with the catalogue and the locale (#27). */
export type PlanensAnalys = Pick<Grovfoderanalys, 'typ' | 'labb' | 'provdatum'>

export interface PlanOgonblick {
  /** Values from #27 on. A snapshot saved before then holds the text the web composed, kept as it was saved. */
  analys: PlanensAnalys | string
  /** The plan saved on the server that the snapshot is of; none for the demo or a snapshot from before #27. */
  planId?: string
  grovfoderKgPerDag: number
  produkter: { namn: string; gramPerDag: number }[]
  kostnadPerManad: number
}

export interface Journalpost {
  id: string
  /** ÅÅÅÅ-MM-DD */
  datum: string
  viktKg?: number
  hull?: number
  text: string
  plan?: PlanOgonblick
}

export interface Trend {
  vikt?: { forsta: number; senaste: number; dagar: number; procentPerVecka: number }
  hull?: { forsta: number; senaste: number }
  senastMatt?: string
  nastaUppfoljning?: string
  uppfoljningForfallen: boolean
  varningar: Trendvarning[]
}

// SLU: bantning bör ske under en längre period (> 1 månad) och hullet följas regelbundet.
const UPPFOLJNING_DAGAR = 28
// ANTAGANDE: viktnedgång över ungefär 1 % per vecka är för snabb. Branschpraxis, inte SLU.
const MAX_NEDGANG_PROCENT_PER_VECKA = 1

const DAY_MS = 24 * 60 * 60 * 1000
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS)
const addDays = (datum: string, dagar: number) =>
  new Date(Date.parse(datum) + dagar * DAY_MS).toISOString().slice(0, 10)

export function sorteradePoster(poster: Journalpost[]): Journalpost[] {
  return [...poster].sort((a, b) => a.datum.localeCompare(b.datum) || a.id.localeCompare(b.id))
}

export function beraknaTrend(poster: Journalpost[], idag: string): Trend {
  const sorterade = sorteradePoster(poster)
  const vikter = sorterade.filter((p): p is Journalpost & { viktKg: number } => p.viktKg !== undefined)
  const hull = sorterade.filter((p): p is Journalpost & { hull: number } => p.hull !== undefined)
  const matningar = sorterade.filter((p) => p.viktKg !== undefined || p.hull !== undefined)
  const trend: Trend = { uppfoljningForfallen: false, varningar: [] }

  if (vikter.length >= 2) {
    const forsta = vikter[0]
    const senaste = vikter[vikter.length - 1]
    const dagar = daysBetween(forsta.datum, senaste.datum)
    const procent = ((senaste.viktKg - forsta.viktKg) / forsta.viktKg) * 100
    const procentPerVecka = dagar > 0 ? (procent / dagar) * 7 : 0
    trend.vikt = { forsta: forsta.viktKg, senaste: senaste.viktKg, dagar, procentPerVecka }
    if (procentPerVecka < -MAX_NEDGANG_PROCENT_PER_VECKA) {
      trend.varningar.push({ code: 'trend.weightLossFast', params: { percentPerWeek: Math.abs(procentPerVecka) } })
    }
  }
  if (hull.length >= 1) {
    trend.hull = { forsta: hull[0].hull, senaste: hull[hull.length - 1].hull }
    if (hull.length >= 2 && trend.hull.senaste > trend.hull.forsta && trend.hull.forsta >= 6) {
      trend.varningar.push({ code: 'trend.conditionRising', params: {} })
    }
  }
  if (matningar.length) {
    trend.senastMatt = matningar[matningar.length - 1].datum
    trend.nastaUppfoljning = addDays(trend.senastMatt, UPPFOLJNING_DAGAR)
    trend.uppfoljningForfallen = trend.nastaUppfoljning <= idag
  }
  return trend
}

/**
 * A new journal entry. The caller gives the ID, so the engine reads neither the clock nor a random source (ADR 0004,
 * #80). Entries on the same date are sorted by ID (sorteradePoster), so the caller's IDs decide their order.
 */
export function nyPost(id: string, datum: string, falt: Omit<Journalpost, 'id' | 'datum'>): Journalpost {
  return { id, datum, ...falt }
}

/**
 * Sammanfattning av en plan att spara i journalen, så att man ser vilken plan som gällde när. Analystexten
 * ("Hösilage, Testlabb Alfa, 2026-06-05") sätts av webben, som har grovfodrets namn i sin katalog (ADR 0014); den
 * sparas som den är.
 */
export function ogonblickAvPlan(
  plan: {
    grovfoderKgPerDag: number
    behallnaFoder: Foderpost[]
    urval: { poster: Foderpost[]; kostnadPerManad: number } | null
  },
  analys: PlanensAnalys,
  planId?: string,
): PlanOgonblick {
  const poster = [...plan.behallnaFoder, ...(plan.urval?.poster ?? [])]
  return {
    analys: { typ: analys.typ, labb: analys.labb, provdatum: analys.provdatum },
    ...(planId !== undefined && { planId }),
    grovfoderKgPerDag: Math.round(plan.grovfoderKgPerDag * 10) / 10,
    produkter: poster.map((p) => ({ namn: p.produkt.namn, gramPerDag: p.gramPerDag })),
    kostnadPerManad: Math.round(poster.reduce((s, p) => s + monthlyCost(p.produkt, p.gramPerDag), 0)),
  }
}
