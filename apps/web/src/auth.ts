// MOCK: konton sparas i webbläsaren. Inget lösenord kontrolleras eller sparas. Byts mot riktig
// inloggning (t.ex. Supabase Auth) efter hackathon; resten av appen ser bara Anvandare.

import i18n from './i18n'

export interface Anvandare {
  id: string
  namn: string
  epost: string
}

const KONTON = 'krubba.konton.v1'
const SESSION = 'krubba.session.v1'

export const DEMOKONTO: Anvandare = { id: 'demo', namn: 'Anna Demo', epost: 'demo@fodr.se' }

function las<T>(nyckel: string, standard: T): T {
  try {
    const raw = localStorage.getItem(nyckel)
    return raw ? (JSON.parse(raw) as T) : standard
  } catch {
    return standard
  }
}

function skriv(nyckel: string, varde: unknown) {
  try {
    if (varde === null) localStorage.removeItem(nyckel)
    else localStorage.setItem(nyckel, JSON.stringify(varde))
  } catch {
    // Lagring blockerad: inloggningen gäller bara tills sidan laddas om.
  }
}

export function aktuellAnvandare(): Anvandare | null {
  return las<Anvandare | null>(SESSION, null)
}

/** Loggar in befintligt konto via e-post, eller skapar ett nytt om namn anges. */
export function loggaIn(epost: string, namn?: string): Anvandare {
  const normaliserad = epost.trim().toLowerCase()
  if (normaliserad === DEMOKONTO.epost) {
    skriv(SESSION, DEMOKONTO)
    return DEMOKONTO
  }
  const konton = las<Anvandare[]>(KONTON, [])
  let konto = konton.find((k) => k.epost === normaliserad)
  if (!konto) {
    if (!namn?.trim()) throw new Error(i18n.t('login.noAccount'))
    konto = { id: `anv-${Date.now()}`, namn: namn.trim(), epost: normaliserad }
    skriv(KONTON, [...konton, konto])
  }
  skriv(SESSION, konto)
  return konto
}

export function loggaUt() {
  skriv(SESSION, null)
}
