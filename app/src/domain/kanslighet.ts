// Känsligheter som styr produktvalet och ger råd om dagens foder. Varje regel anger sin källa.
// Ingredienser är härledda ur produktbeskrivningar och kan missa saker; planen säger det.

import type { Foderpost } from './intake'
import type { Halsa, Produkt } from './types'

export interface Kanslighetsrad {
  niva: 'info' | 'varning'
  text: string
  kalla: string
}

export interface Uteslutning {
  produkt: Produkt
  skal: string[]
}

// ANTAGANDE: "mycket stärkelse" vid magsår, mer än 100 g per kg foder. Branschpraxis, inte SLU.
const STARKELSE_HOG_G_PER_KG = 100
// ANTAGANDE: proteinöverskott värt att påpeka vid proteinkänslighet, över 30 % mer än behovet.
const PROTEIN_OVER_ANDEL = 1.3

/** Fång, EMS, PPID och korsförlamning kräver alla lågt socker och lite stärkelse. */
export function kraverLagSockerStarkelse(h: Halsa): boolean {
  return h.fang || h.ems || Boolean(h.ppid) || Boolean(h.pssm)
}

/** Skäl till att produkten inte passar hästen. Tom lista betyder att inget talar emot. */
export function skalMotProdukt(p: Produkt, h: Halsa): string[] {
  const skal: string[] = []
  if (kraverLagSockerStarkelse(h) && !p.lampligVidFangEms) skal.push('för mycket eller okänt socker och stärkelse')
  if (h.magsar && (p.ingredienser.includes('spannmål') || (p.perKg.starkelse ?? 0) > STARKELSE_HOG_G_PER_KG)) {
    skal.push('spannmål eller mycket stärkelse, olämpligt vid magsår')
  }
  if (h.luftvagar && p.form === 'pulver') skal.push('pulverform kan damma')
  for (const ingrediens of h.undvik ?? []) {
    if (p.ingredienser.includes(ingrediens)) skal.push(`innehåller ${ingrediens}`)
  }
  if (h.proteinkanslig && p.kategori === 'proteinfoder') skal.push('proteinfoder')
  return skal
}

export function filtreraProdukter(produkter: Produkt[], h: Halsa): { tillatna: Produkt[]; uteslutna: Uteslutning[] } {
  const tillatna: Produkt[] = []
  const uteslutna: Uteslutning[] = []
  for (const p of produkter) {
    const skal = skalMotProdukt(p, h)
    if (skal.length) uteslutna.push({ produkt: p, skal })
    else tillatna.push(p)
  }
  return { tillatna, uteslutna }
}

export function granskaKansligheter(
  h: Halsa,
  nuvarande: Foderpost[],
  protein: { intag: number; behov: number },
  viktKg: number,
): Kanslighetsrad[] {
  const rader: Kanslighetsrad[] = []

  for (const { produkt } of nuvarande) {
    const skal = skalMotProdukt(produkt, h)
    if (skal.length) {
      rader.push({
        niva: 'varning',
        text: `${produkt.namn}, som hästen får i dag: ${skal.join(', ')}. Överväg att byta.`,
        kalla: 'Fodrs känslighetsregler',
      })
    }
  }

  if (h.magsar) {
    // SLU: högst 150 g stärkelse per 100 kg och mål, grovfoder före kraftfoder.
    const perMal = Math.round(1.5 * viktKg)
    rader.push({
      niva: 'info',
      text: `Magsår: ge grovfoder före kraftfoder och dela upp fodret på flera mål. SLU:s tak är ${perMal} g stärkelse per mål för den här hästen; vid magsår bör det ligga klart under.`,
      kalla: 'SLU riktlinjer för kraftfoder, sid 33',
    })
  }
  if (h.pssm) {
    rader.push({
      niva: 'info',
      text: 'Korsförlamning: håll socker och stärkelse låga och använd fett som energikälla om hästen behöver mer energi. Selen och vitamin E är viktiga, och planen täcker dem.',
      kalla: 'Branschpraxis (ej SLU)',
    })
  }
  if (h.luftvagar) {
    rader.push({
      niva: 'info',
      text: 'Luftvägar: blötlägg eller ånga höet, eller välj hösilage, och undvik dammigt foder och strö. Mögligt och dammigt hö är en vanlig orsak till luftvägsbesvär.',
      kalla: 'SLU sid 30',
    })
  }
  if (h.tandproblem) {
    rader.push({
      niva: 'info',
      text: 'Tandproblem: blötlägg pellets till mash. Om hästen inte kan tugga långstrå, ersätt en del av grovfodret med hackat grovfoder eller grovfoderpellets. Låt tandläkare kontrollera munnen.',
      kalla: 'Branschpraxis, SLU sid 34 (mun- och tandstatus)',
    })
  }
  if (h.proteinkanslig && protein.intag > protein.behov * PROTEIN_OVER_ANDEL) {
    const procent = Math.round((protein.intag / protein.behov - 1) * 100)
    rader.push({
      niva: 'varning',
      text: `Hästen får ${procent} % mer protein än den behöver. Vid proteinkänslighet: välj ett grovfoder med lägre proteinhalt eller blanda in halm.`,
      kalla: 'SLU tabell 32',
    })
  }
  if (h.undvik?.length) {
    rader.push({
      niva: 'info',
      text: `Produkter med ${h.undvik.join(', ')} är bortvalda. Ingredienserna är tolkade ur butikernas beskrivningar, så kontrollera förpackningen.`,
      kalla: 'Härlett ur produktbeskrivningar',
    })
  }
  return rader
}
