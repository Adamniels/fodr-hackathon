// What is still kept in the browser: the demo's journal until #29 (an account's journal is on the API since #28,
// journal.ts), and the cached plan explanations.

import { DEMO_USER } from './demo'
import { demoJournal } from './data/examples'
import type { Journalpost } from '@fodr/domain/journal'

/**
 * The ID of a new journal entry. It starts with the time, so entries on the same date keep the order they were
 * added in (sorteradePoster sorts by date, then ID); #28 replaces it with the database ID and an explicit order.
 */
export function newJournalEntryId(): string {
  return `post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
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
