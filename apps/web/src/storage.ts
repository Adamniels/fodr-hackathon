// Hästprofiler per användare, sparade lokalt i webbläsaren. Det här är den enda filen som behöver
// bytas mot API-anrop när riktiga konton och en databas kommer.

import { DEMOKONTO } from './auth'
import { demoHast, demoJournal, ponny } from './data/examples'
import type { Journalpost } from '@fodr/domain/journal'
import type { Hastprofil } from '@fodr/domain/types'

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

/**
 * The ID of a new journal entry. It starts with the time, so entries on the same date keep the order they were
 * added in (sorteradePoster sorts by date, then ID); #28 replaces it with the database ID and an explicit order.
 */
export function newJournalEntryId(): string {
  return `post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
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

// Senaste AI-förklaringen per häst. Nyckeln är ett fingeravtryck av underlaget, så samma plan ger
// samma text utan nytt API-anrop, medan en ändrad plan får en ny förklaring.
const forklaringNyckel = (hastId: string) => `fodr.forklaring.v1.${hastId}`
const forklaringMinne = new Map<string, { avtryck: string; text: string }>()

export function laddaForklaring(hastId: string, avtryck: string): string | null {
  let sparad = forklaringMinne.get(hastId)
  if (!sparad) {
    try {
      const raw = localStorage.getItem(forklaringNyckel(hastId))
      if (raw) sparad = JSON.parse(raw) as { avtryck: string; text: string }
    } catch {
      // Lagring otillgänglig eller trasig.
    }
  }
  return sparad?.avtryck === avtryck ? sparad.text : null
}

export function sparaForklaring(hastId: string, avtryck: string, text: string) {
  forklaringMinne.set(hastId, { avtryck, text })
  try {
    localStorage.setItem(forklaringNyckel(hastId), JSON.stringify({ avtryck, text }))
  } catch {
    // Ignorera, texten finns kvar i minnet under sessionen.
  }
}

/** Kort, stabilt fingeravtryck av en text (FNV-1a). */
export function avtryck(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${(h >>> 0).toString(36)}-${text.length}`
}
