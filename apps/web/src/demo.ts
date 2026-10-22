// The demo account, in the browser only (owner, #23): no backend account, its horses (useDemoHorses, #25) and journal
// in localStorage as before the real accounts. The demo button opens it; #29 removes it together with the example data.
import { useEffect, useState } from 'react'
import type { User } from '@fodr/contracts/me'
import { tillGrovfoderanalys } from '@fodr/domain/analysis'
import type { Hastprofil } from '@fodr/domain/types'
import type { AnalysisStore, StoredAnalysis } from './analyses'
import { ApiError } from './api-v1'
import { fileToBase64, readAnalysis } from './api'
import { demoHast, ponny } from './data/examples'
import { newHorseProfile, type HorseStore } from './horses'

// The ID keys the demo's stored horses (below) and journal (storage.ts), so it keeps the mock's value.
export const DEMO_USER: User = { id: 'demo', name: 'Anna Demo', email: 'demo@fodr.se', emailVerified: true }

const DEMO_KEY = 'fodr.demo.v1'

// The accounts and session the localStorage mock kept before the real accounts (#23): names and emails nobody reads
// any more, removed once at startup.
const MOCK_ACCOUNT_KEYS = ['krubba.konton.v1', 'krubba.session.v1']

export function forgetMockAccounts(): void {
  try {
    for (const key of MOCK_ACCOUNT_KEYS) localStorage.removeItem(key)
  } catch {
    // Storage blocked: nothing to remove.
  }
}

// An account's horses were kept under this prefix before the API (#25): pre-beta data nobody reads any more, health
// notes included, removed once at startup. The demo's own key stays until #29.
const HORSES_PREFIX = 'krubba.hastar.v2.'

export function forgetLocalHorses(): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    for (const key of keys) {
      if (key?.startsWith(HORSES_PREFIX) && key !== HORSES_PREFIX + DEMO_USER.id) localStorage.removeItem(key)
    }
  } catch {
    // Storage blocked: nothing to remove.
  }
}

// v2: the profile gained breed, performance and environment.
const horsesKey = HORSES_PREFIX + DEMO_USER.id

function loadHorses(): Hastprofil[] {
  try {
    const raw = localStorage.getItem(horsesKey)
    if (raw) return JSON.parse(raw) as Hastprofil[]
  } catch {
    // Storage unavailable or corrupt.
  }
  return [demoHast, ponny]
}

function saveHorses(hastar: Hastprofil[]) {
  try {
    localStorage.setItem(horsesKey, JSON.stringify(hastar))
  } catch {
    // Ignore; the profiles stay in memory for the session.
  }
}

/** The demo's horses, kept in the browser as before the API (#25). Every change is stored at once. */
export function useDemoHorses(): HorseStore {
  const [horses, setHorses] = useState(loadHorses)
  useEffect(() => saveHorses(horses), [horses])
  return {
    horses,
    create: () => {
      const horse = { ...newHorseProfile(), id: `hast-${String(Date.now())}` }
      setHorses((all) => [...all, horse])
      return Promise.resolve(horse)
    },
    update: (horse) => setHorses((all) => all.map((h) => (h.id === horse.id ? horse : h))),
    remove: (id) => {
      setHorses((all) => all.filter((h) => h.id !== id))
      return Promise.resolve()
    },
    saveState: () => undefined,
    retrySave: () => undefined,
    flush: () => Promise.resolve(),
  }
}

/**
 * The demo's analyses, one per horse, in memory only as before the API (#26): the report is read through the AI route
 * and converted here, as the API does for an account. Gone on reload, like the demo's analysis always was.
 */
export function useDemoAnalysis(horseId: string | undefined): AnalysisStore {
  const [analyses, setAnalyses] = useState<Record<string, StoredAnalysis>>({})
  const set = (analysis: StoredAnalysis) => {
    if (horseId !== undefined) setAnalyses((all) => ({ ...all, [horseId]: analysis }))
  }
  return {
    current: horseId === undefined ? null : (analyses[horseId] ?? null),
    loadFailed: false,
    reload: () => undefined,
    upload: async (file) => {
      const reading = await readAnalysis(await fileToBase64(file))
      const result = tillGrovfoderanalys(reading)
      // The same refusal the API gives an account (422 with the domain's code).
      if ('error' in result) throw new ApiError(422, result.error.code)
      set({ analys: result.analys, omrakningar: result.omrakningar, anmarkningar: reading.anmarkningar })
    },
    loadExample: (analys) => {
      set({ analys, omrakningar: [], anmarkningar: [] })
      return Promise.resolve()
    },
    correct: (analys, omrakningar) => {
      const analysis = horseId === undefined ? undefined : analyses[horseId]
      if (analysis) set({ ...analysis, analys, omrakningar })
    },
    saveState: undefined,
    retrySave: () => undefined,
  }
}

export function isDemoOpen(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export function setDemoOpen(open: boolean): void {
  try {
    if (open) localStorage.setItem(DEMO_KEY, '1')
    else localStorage.removeItem(DEMO_KEY)
  } catch {
    // Storage blocked: the demo lasts until the page reloads.
  }
}
