// Syntetiska testfall. Påhittade hästar och analyser med realistiska värden, inga verkliga personer.

import type { Journalpost } from '../domain/journal'
import type { Grovfoderanalys, Hastprofil } from '../domain/types'

export const demoHast: Hastprofil = {
  id: 'demo-sixten',
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
  // A01 har bara 39,7 % ts, så det går åt mycket vara: 16 kg ger 6,4 kg ts.
  grovfoder: { typ: 'hosilage', kgPerDag: 16 },
  nuvarandeFoder: [{ produktId: 'gg-1235447', namn: 'Hästfoder Krafft Leisure Pellets 20kg', gramPerDag: 1000 }],
}

export const ponny: Hastprofil = {
  id: 'demo-pysen',
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

// Analyserna är facit för kollegans syntetiska testrapporter (testdata/Testdata-from-other-dev),
// byggda på Växas foderstatistik 2026. Labben är fiktiva.

/** A01: rikssnittet för blandvallsensilage skörd 1. Demofallet. */
export const analysKomplett: Grovfoderanalys = {
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

/** A05: basanalys, mineraler saknas. */
export const analysBas: Grovfoderanalys = {
  typ: 'hosilage',
  labb: 'Testlabb Alfa',
  provdatum: '2026-06-05',
  tsProcent: 46,
  askaGPerKgTs: 65,
  perKgTs: { energi: 9.9, smbRp: 88, socker: 66 },
}

/** A07: sent hö med lågt protein och högt socker. Selen ej analyserat. */
export const analysHo: Grovfoderanalys = {
  typ: 'ho',
  labb: 'Testlabb Alfa',
  provdatum: '2026-07-20',
  tsProcent: 84.1,
  askaGPerKgTs: 53,
  perKgTs: {
    energi: 8.4,
    smbRp: 44,
    socker: 122,
    ca: 3.52,
    p: 1.83,
    mg: 1.31,
    na: 0.31,
    fe: 107,
    mn: 73,
    zn: 22,
    cu: 5,
  },
}

/** Demojournaler per häst-id. Sixtens sista anteckning ska få AI:n att flagga veterinär (ömma hovar och fånghistorik). */
export const demoJournal: Record<string, Journalpost[]> = {
  'demo-sixten': [
    {
      id: 'demo-1',
      datum: '2026-08-31',
      viktKg: 570,
      hull: 8,
      text: 'Startar bantning efter samtal med veterinären. Tog bort havren, behåller pelletsen tills vidare. Han är tjock över manken och svansroten.',
    },
    {
      id: 'demo-2',
      datum: '2026-09-28',
      viktKg: 558,
      hull: 7,
      text: 'Bytte till nya hösilagebalar förra veckan. Lite lös i magen första dagarna, nu bra igen. Pigg i ridningen.',
    },
    {
      id: 'demo-3',
      datum: '2026-10-12',
      viktKg: 550,
      hull: 7,
      text: 'Lite öm på framhovarna efter uteritt på grusväg i helgen, gick lite stelt i hagen på morgonen. Annars glad.',
    },
  ],
  'demo-pysen': [
    {
      id: 'demo-4',
      datum: '2026-10-01',
      viktKg: 280,
      hull: 5,
      text: 'Flyttade ut på lösdrift med flocken. Fryser inte, men äter mycket hö.',
    },
  ],
}
