// Hästens journal: mätningar, iakttagelser och sparade planer över tid. Trend och påminnelser räknas
// här utan AI. AI:n läser journalen och letar mönster (server/ai.ts), men ändrar aldrig planen.

import { monthlyCost, type Foderpost } from './intake'
import type { Grovfoderanalys } from './types'

export interface PlanOgonblick {
  analys: string
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
  varningar: string[]
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
  const vikter = sorterade.filter((p) => p.viktKg !== undefined)
  const hull = sorterade.filter((p) => p.hull !== undefined)
  const matningar = sorterade.filter((p) => p.viktKg !== undefined || p.hull !== undefined)
  const trend: Trend = { uppfoljningForfallen: false, varningar: [] }

  if (vikter.length >= 2) {
    const forsta = vikter[0]
    const senaste = vikter[vikter.length - 1]
    const dagar = daysBetween(forsta.datum, senaste.datum)
    const procent = ((senaste.viktKg! - forsta.viktKg!) / forsta.viktKg!) * 100
    const procentPerVecka = dagar > 0 ? (procent / dagar) * 7 : 0
    trend.vikt = { forsta: forsta.viktKg!, senaste: senaste.viktKg!, dagar, procentPerVecka }
    if (procentPerVecka < -MAX_NEDGANG_PROCENT_PER_VECKA) {
      trend.varningar.push(
        `Vikten minskar ${Math.abs(procentPerVecka).toFixed(1).replace('.', ',')} % per vecka. Snabbare än ungefär 1 % per vecka ökar risken för ämnesomsättningsproblem; SLU rekommenderar att bantning sker över mer än en månad.`,
      )
    }
  }
  if (hull.length >= 1) {
    trend.hull = { forsta: hull[0].hull!, senaste: hull[hull.length - 1].hull! }
    if (hull.length >= 2 && trend.hull.senaste > trend.hull.forsta && trend.hull.forsta >= 6) {
      trend.varningar.push('Hullet ökar trots att hästen redan var i överhull. Se över energin i foderstaten.')
    }
  }
  if (matningar.length) {
    trend.senastMatt = matningar[matningar.length - 1].datum
    trend.nastaUppfoljning = addDays(trend.senastMatt, UPPFOLJNING_DAGAR)
    trend.uppfoljningForfallen = trend.nastaUppfoljning <= idag
  }
  return trend
}

export function nyPost(datum: string, falt: Omit<Journalpost, 'id' | 'datum'>): Journalpost {
  return { id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, datum, ...falt }
}

/** Sammanfattning av en plan att spara i journalen, så att man ser vilken plan som gällde när. */
export function ogonblickAvPlan(
  plan: {
    grovfoderKgPerDag: number
    behallnaFoder: Foderpost[]
    urval: { poster: Foderpost[]; kostnadPerManad: number } | null
  },
  analys: Grovfoderanalys,
): PlanOgonblick {
  const poster = [...plan.behallnaFoder, ...(plan.urval?.poster ?? [])]
  return {
    analys: [analys.typ === 'hosilage' ? 'Hösilage' : 'Hö', analys.labb, analys.provdatum].filter(Boolean).join(', '),
    grovfoderKgPerDag: Math.round(plan.grovfoderKgPerDag * 10) / 10,
    produkter: poster.map((p) => ({ namn: p.produkt.namn, gramPerDag: p.gramPerDag })),
    kostnadPerManad: Math.round(poster.reduce((s, p) => s + monthlyCost(p.produkt, p.gramPerDag), 0)),
  }
}
