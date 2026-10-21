// MOCK: accounts are saved in the browser. No password is checked or stored. To be replaced with real
// login (e.g. Supabase Auth) after the hackathon; the rest of the app only sees User.

import i18n from './i18n'

// The fields are stored under ACCOUNTS_KEY and SESSION_KEY, so they keep their names (ADR 0016, rule 7).
export interface User {
  id: string
  namn: string
  epost: string
}

const ACCOUNTS_KEY = 'krubba.konton.v1'
const SESSION_KEY = 'krubba.session.v1'

export const DEMO_ACCOUNT: User = { id: 'demo', namn: 'Anna Demo', epost: 'demo@fodr.se' }

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked: the login lasts only until the page reloads.
  }
}

export function currentUser(): User | null {
  return readStored<User | null>(SESSION_KEY, null)
}

/** Logs in an existing account by email, or creates a new one when a name is given. */
export function logIn(email: string, name?: string): User {
  const normalized = email.trim().toLowerCase()
  if (normalized === DEMO_ACCOUNT.epost) {
    writeStored(SESSION_KEY, DEMO_ACCOUNT)
    return DEMO_ACCOUNT
  }
  const accounts = readStored<User[]>(ACCOUNTS_KEY, [])
  let account = accounts.find((a) => a.epost === normalized)
  if (!account) {
    if (!name?.trim()) throw new Error(i18n.t('login.noAccount'))
    account = { id: `anv-${Date.now()}`, namn: name.trim(), epost: normalized }
    writeStored(ACCOUNTS_KEY, [...accounts, account])
  }
  writeStored(SESSION_KEY, account)
  return account
}

export function logOut() {
  writeStored(SESSION_KEY, null)
}
