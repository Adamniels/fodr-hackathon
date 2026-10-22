// The demo account's data for `npm run seed` (#29): two horses, an analysis and a journal, the same as the browser demo
// before the real backend. Journal dates are days before the seed's "today", so the demo's trend and follow-up stay
// current whenever it is seeded. Synthetic horses and values, no real people.
import type { HorseProfile } from '@fodr/contracts/horses'
import type { Grovfoderanalys } from '@fodr/domain/types'

export const SIXTEN: HorseProfile = {
  namn: 'Sixten',
  alderAr: 12,
  kon: 'valack',
  typ: 'normalfodd',
  viktKg: 550,
  hull: 7,
  ras: 'varmblod_rid',
  ridning: { passPerVecka: 4, minuterPerPass: 60, travGaloppMinPerPass: 15 },
  prestanda: 'fritid',
  miljo: { hallning: 'box', timmarUtePerDag: 8, klippt: false, tacke: true, lagstaTempC: -10 },
  halsa: { fang: true, ems: false, ovrigt: 'Fång för två år sedan, inga besvär sedan dess.' },
  grovfoder: { typ: 'hosilage', kgPerDag: 16 },
  nuvarandeFoder: [{ produktId: 'gg-1235447', namn: 'Hästfoder Krafft Leisure Pellets 20kg', gramPerDag: 1000 }],
}

export const PYSEN: HorseProfile = {
  namn: 'Pysen',
  alderAr: 22,
  kon: 'sto',
  typ: 'lattfodd',
  viktKg: 280,
  hull: 5,
  ras: 'islandshast',
  arbetsniva: 'latt',
  prestanda: 'fritid',
  miljo: { hallning: 'losdrift', timmarUtePerDag: 24, klippt: false, tacke: false, lagstaTempC: -20 },
  halsa: { fang: false, ems: true, ovrigt: '' },
  grovfoder: { typ: 'ho', kgPerDag: 6 },
  nuvarandeFoder: [],
}

/** Sixten's hösilage: the national average for mixed-ley silage, first cut (Växa 2026), from a fictional lab. */
export const SIXTEN_ANALYSIS: Grovfoderanalys = {
  typ: 'hosilage',
  labb: 'Testlabb Alfa',
  provdatum: '2026-06-10',
  tsProcent: 39.7,
  askaGPerKgTs: 71,
  perKgTs: {
    energi: 10.2,
    smbRp: 104,
    socker: 61,
    ca: 5.3,
    p: 2.66,
    mg: 1.71,
    na: 0.83,
    fe: 180,
    mn: 58,
    zn: 32,
    cu: 6,
    se: 0.03,
  },
}

export interface SeedEntry {
  /** Days before the seed's "today". */
  daysAgo: number
  viktKg: number
  hull: number
  text: string
}

export const SIXTEN_JOURNAL: SeedEntry[] = [
  {
    daysAgo: 45,
    viktKg: 570,
    hull: 8,
    text: 'Startar bantning efter samtal med veterinären. Tog bort havren, behåller pelletsen tills vidare. Han är tjock över manken och svansroten.',
  },
  {
    daysAgo: 17,
    viktKg: 558,
    hull: 7,
    text: 'Bytte till nya hösilagebalar förra veckan. Lite lös i magen första dagarna, nu bra igen. Pigg i ridningen.',
  },
  {
    daysAgo: 3,
    viktKg: 550,
    hull: 7,
    text: 'Lite öm på framhovarna efter uteritt på grusväg i helgen, gick lite stelt i hagen på morgonen. Annars glad.',
  },
]

export const PYSEN_JOURNAL: SeedEntry[] = [
  { daysAgo: 14, viktKg: 280, hull: 5, text: 'Flyttade ut på lösdrift med flocken. Fryser inte, men äter mycket hö.' },
]
