import type { ParseKeys } from 'i18next'
import i18n from '.'

// Better Auth's error codes as text (ADR 0009 note: its routes answer { code, message } in English, not problem+json).
// Codes not listed here get the generic text; the table is the place to add one.
const KEYS: Record<string, ParseKeys> = {
  INVALID_EMAIL_OR_PASSWORD: 'auth.errors.INVALID_EMAIL_OR_PASSWORD',
  INVALID_EMAIL: 'auth.errors.INVALID_EMAIL',
  PASSWORD_TOO_SHORT: 'auth.errors.PASSWORD_TOO_SHORT',
  PASSWORD_TOO_LONG: 'auth.errors.PASSWORD_TOO_LONG',
  INVALID_TOKEN: 'auth.errors.INVALID_TOKEN',
  RATE_LIMITED: 'auth.errors.RATE_LIMITED',
}

export function authErrorText(code: string): string {
  return i18n.t(KEYS[code] ?? 'auth.errors.UNKNOWN')
}
