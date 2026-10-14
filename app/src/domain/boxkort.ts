// Boxkortet: planen omräknad till vad som ska i krubban morgon och kväll, som kortet på boxdörren.
// SLU: grovfodret fördelas på minst två utfodringstillfällen, längsta ätuppehåll högst 10–12 timmar.

import type { Plan } from './plan'
import type { Grovfodertyp } from './types'

export interface Boxrad {
  namn: string
  enhet: 'kg' | 'g'
  morgon: number
  kvall: number
}

export interface Boxkort {
  rader: Boxrad[]
  borttagna: string[]
}

const halvaKg = (kg: number) => Math.round(kg) / 2 // avrundat till närmaste halvkilo per mål
const delaGram = (g: number) => [Math.ceil(g / 2), Math.floor(g / 2)] as const

export function byggBoxkort(plan: Plan, grovfoder: Grovfodertyp): Boxkort {
  const grovPerMal = halvaKg(plan.grovfoderKgPerDag)
  const rader: Boxrad[] = [
    { namn: grovfoder === 'hosilage' ? 'Hösilage' : 'Hö', enhet: 'kg', morgon: grovPerMal, kvall: grovPerMal },
  ]
  // Kraftfoder och salt delas på två mål; mineralfoder och tillskott ges i en dos på morgonen.
  for (const p of plan.behallnaFoder) {
    const [m, k] = delaGram(p.gramPerDag)
    rader.push({ namn: p.produkt.namn, enhet: 'g', morgon: m, kvall: k })
  }
  for (const p of plan.urval?.poster ?? []) {
    if (p.produkt.kategori === 'salt') {
      const [m, k] = delaGram(p.gramPerDag)
      rader.push({ namn: p.produkt.namn, enhet: 'g', morgon: m, kvall: k })
    } else {
      rader.push({ namn: p.produkt.namn, enhet: 'g', morgon: p.gramPerDag, kvall: 0 })
    }
  }
  return { rader, borttagna: plan.borttagnaFoder.map((p) => p.produkt.namn) }
}
