// Känsligheter som styr produktvalet och ger råd om dagens foder. Varje regel anger sin källa.
// Ingredienser är härledda ur produktbeskrivningar och kan missa saker; planen säger det.

import type { Foderpost } from './intake'
import type { Kallhanvisning, SensitivityMessage, Uteslutningsskal } from './messages'
import type { Halsa, Produkt } from './types'

export interface Kanslighetsrad {
  niva: 'info' | 'varning'
  text: SensitivityMessage
  kalla: Kallhanvisning
}

export interface Uteslutning {
  produkt: Produkt
  skal: Uteslutningsskal[]
}

// ANTAGANDE: "mycket stärkelse" vid magsår, mer än 100 g per kg foder. Branschpraxis, inte SLU.
const STARKELSE_HOG_G_PER_KG = 100
// ANTAGANDE: proteinöverskott värt att påpeka vid proteinkänslighet, över 30 % mer än behovet.
const PROTEIN_OVER_ANDEL = 1.3

// ANTAGANDE: vanlig rekommendation för hästar med fång eller EMS är grovfoder med under ca 10 % socker
// (100 g/kg ts). SLU Rapport 289 anger ingen sockergräns. Gäller alla som kräver lite socker och stärkelse,
// även PPID och korsförlamning (#15). En gräns för planens varning och grovfoderflaggan, så att en häst får
// den ena eller den andra, aldrig båda eller ingen.
export const SOCKER_GRANS_G_PER_KG_TS = 100

/** Fång, EMS, PPID och korsförlamning kräver alla lågt socker och lite stärkelse. */
export function kraverLagSockerStarkelse(h: Halsa): boolean {
  return h.fang || h.ems || Boolean(h.ppid) || Boolean(h.pssm)
}

/** Skäl till att produkten inte passar hästen. Tom lista betyder att inget talar emot. */
export function skalMotProdukt(p: Produkt, h: Halsa): Uteslutningsskal[] {
  const skal: Uteslutningsskal[] = []
  if (kraverLagSockerStarkelse(h) && !p.lampligVidFangEms) skal.push({ code: 'exclusion.sugarStarch', params: {} })
  // eslint-disable-next-line no-restricted-syntax -- an ingredient identifier (the Ingrediens type), not text
  if (h.magsar && (p.ingredienser.includes('spannmål') || (p.perKg.starkelse ?? 0) > STARKELSE_HOG_G_PER_KG)) {
    skal.push({ code: 'exclusion.grainOrStarch', params: {} })
  }
  if (h.luftvagar && p.form === 'pulver') skal.push({ code: 'exclusion.powder', params: {} })
  for (const ingrediens of h.undvik ?? []) {
    if (p.ingredienser.includes(ingrediens)) {
      skal.push({ code: 'exclusion.containsIngredient', params: { ingredient: ingrediens } })
    }
  }
  if (h.proteinkanslig && p.kategori === 'proteinfoder') skal.push({ code: 'exclusion.proteinFeed', params: {} })
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
        text: { code: 'sensitivity.currentFeed', params: { product: produkt.namn, reasons: skal } },
        kalla: { code: 'source.fodrRules', params: {} },
      })
    }
  }

  if (h.magsar) {
    // SLU: högst 150 g stärkelse per 100 kg och mål, grovfoder före kraftfoder.
    const perMal = Math.round(1.5 * viktKg)
    rader.push({
      niva: 'info',
      text: { code: 'sensitivity.ulcer', params: { starchPerMealG: perMal } },
      kalla: { code: 'source.concentrateGuidelinesPage33', params: {} },
    })
  }
  if (h.pssm) {
    rader.push({
      niva: 'info',
      text: { code: 'sensitivity.pssm', params: {} },
      kalla: { code: 'source.industryPractice', params: {} },
    })
  }
  if (h.luftvagar) {
    rader.push({
      niva: 'info',
      text: { code: 'sensitivity.airways', params: {} },
      kalla: { code: 'source.page30', params: {} },
    })
  }
  if (h.tandproblem) {
    rader.push({
      niva: 'info',
      text: { code: 'sensitivity.teeth', params: {} },
      kalla: { code: 'source.industryPracticePage34', params: {} },
    })
  }
  if (h.proteinkanslig && protein.intag > protein.behov * PROTEIN_OVER_ANDEL) {
    const procent = Math.round((protein.intag / protein.behov - 1) * 100)
    rader.push({
      niva: 'varning',
      text: { code: 'sensitivity.proteinExcess', params: { percent: procent } },
      kalla: { code: 'source.table32', params: {} },
    })
  }
  if (h.undvik?.length) {
    rader.push({
      niva: 'info',
      text: { code: 'sensitivity.avoidedIngredients', params: { ingredients: [...h.undvik] } },
      kalla: { code: 'source.productDescriptions', params: {} },
    })
  }
  return rader
}
