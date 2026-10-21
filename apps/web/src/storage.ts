// Horse profiles per user, saved locally in the browser. This is the only file that has to be
// replaced with API calls when real accounts and a database arrive.

import { DEMO_USER } from './demo'
import { demoHast, demoJournal, ponny } from './data/examples'
import type { Journalpost } from '@fodr/domain/journal'
import type { Hastprofil } from '@fodr/domain/types'

// v2: the profile gained breed, performance and environment.
const horsesKey = (userId: string) => `krubba.hastar.v2.${userId}`

export function loadHorses(userId: string): Hastprofil[] {
  try {
    const raw = localStorage.getItem(horsesKey(userId))
    if (raw) return JSON.parse(raw) as Hastprofil[]
  } catch {
    // Storage unavailable or corrupt.
  }
  // The demo account starts with two horses, new accounts start empty.
  return userId === DEMO_USER.id ? [demoHast, ponny] : []
}

export function saveHorses(userId: string, hastar: Hastprofil[]) {
  try {
    localStorage.setItem(horsesKey(userId), JSON.stringify(hastar))
  } catch {
    // Ignore; the profiles stay in memory for the session.
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

// Journal per user: horse ID to entries.
const journalKey = (userId: string) => `krubba.journal.v1.${userId}`

export function loadJournal(userId: string): Record<string, Journalpost[]> {
  try {
    const raw = localStorage.getItem(journalKey(userId))
    if (raw) return JSON.parse(raw) as Record<string, Journalpost[]>
  } catch {
    // Storage unavailable or corrupt.
  }
  return userId === DEMO_USER.id ? demoJournal : {}
}

export function saveJournal(userId: string, journal: Record<string, Journalpost[]>) {
  try {
    localStorage.setItem(journalKey(userId), JSON.stringify(journal))
  } catch {
    // Ignore; the journal stays in memory for the session.
  }
}

// The latest AI explanation per horse, saved with a fingerprint of the plan payload it explains. The same plan
// matches the fingerprint and shows the saved text without a new API call; a changed plan gets a new explanation.
// The stored field is named avtryck: it is persisted, so it keeps its name (ADR 0016, rule 7).
const explanationKey = (hastId: string) => `fodr.forklaring.v1.${hastId}`
const explanationCache = new Map<string, { avtryck: string; text: string }>()

export function loadExplanation(hastId: string, planFingerprint: string): string | null {
  let cached = explanationCache.get(hastId)
  if (!cached) {
    try {
      const raw = localStorage.getItem(explanationKey(hastId))
      if (raw) cached = JSON.parse(raw) as { avtryck: string; text: string }
    } catch {
      // Storage unavailable or corrupt.
    }
  }
  return cached?.avtryck === planFingerprint ? cached.text : null
}

export function saveExplanation(hastId: string, planFingerprint: string, text: string) {
  explanationCache.set(hastId, { avtryck: planFingerprint, text })
  try {
    localStorage.setItem(explanationKey(hastId), JSON.stringify({ avtryck: planFingerprint, text }))
  } catch {
    // Ignore; the text stays in memory for the session.
  }
}

/** A short, stable fingerprint of a text (FNV-1a). */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${(h >>> 0).toString(36)}-${text.length}`
}
