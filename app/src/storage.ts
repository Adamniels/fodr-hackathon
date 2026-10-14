// Hästprofiler per användare, sparade lokalt i webbläsaren. Det här är den enda filen som behöver
// bytas mot API-anrop när riktiga konton och en databas kommer.

import { DEMOKONTO } from './auth'
import { demoHast, demoJournal, ponny } from './data/exempel'
import type { Journalpost } from './domain/journal'
import type { Hastprofil } from './domain/types'

// v2: profilen fick ras, prestanda och miljö.
const nyckel = (anvandarId: string) => `krubba.hastar.v2.${anvandarId}`

export function laddaHastar(anvandarId: string): Hastprofil[] {
  try {
    const raw = localStorage.getItem(nyckel(anvandarId))
    if (raw) return JSON.parse(raw) as Hastprofil[]
  } catch {
    // Lagring otillgänglig eller trasig.
  }
  // Demokontot börjar med två hästar, nya konton börjar tomma.
  return anvandarId === DEMOKONTO.id ? [demoHast, ponny] : []
}

export function sparaHastar(anvandarId: string, hastar: Hastprofil[]) {
  try {
    localStorage.setItem(nyckel(anvandarId), JSON.stringify(hastar))
  } catch {
    // Ignorera, profilerna finns kvar i minnet under sessionen.
  }
}

export function nyHast(): Hastprofil {
  return {
    id: `hast-${Date.now()}`,
    namn: '',
    alderAr: 10,
    kon: 'valack',
    typ: 'normalfodd',
    viktKg: 500,
    hull: 5,
    ridning: { passPerVecka: 4, minuterPerPass: 45, travGaloppMinPerPass: 15 },
    prestanda: 'fritid',
    miljo: { hallning: 'box', timmarUtePerDag: 8, klippt: false, tacke: true, lagstaTempC: -5 },
    halsa: { fang: false, ems: false, ovrigt: '' },
    grovfoder: { typ: 'hosilage', kgPerDag: 10 },
    nuvarandeFoder: [],
  }
}

// Journal per användare: häst-id till poster.
const journalNyckel = (anvandarId: string) => `krubba.journal.v1.${anvandarId}`

export function laddaJournal(anvandarId: string): Record<string, Journalpost[]> {
  try {
    const raw = localStorage.getItem(journalNyckel(anvandarId))
    if (raw) return JSON.parse(raw) as Record<string, Journalpost[]>
  } catch {
    // Lagring otillgänglig eller trasig.
  }
  return anvandarId === DEMOKONTO.id ? demoJournal : {}
}

export function sparaJournal(anvandarId: string, journal: Record<string, Journalpost[]>) {
  try {
    localStorage.setItem(journalNyckel(anvandarId), JSON.stringify(journal))
  } catch {
    // Ignorera, journalen finns kvar i minnet under sessionen.
  }
}
