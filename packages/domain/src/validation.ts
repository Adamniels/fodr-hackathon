// Validates a horse profile and an analysis against LIMITS (#13). The engine refuses input with errors (skapaPlan),
// and the web shows each error next to its field. A missing optional value is unknown, never an error and never 0.

import { LIMITS, type Limit } from './limits'
import type { ValidationMessage } from './messages'
import type { NutrientKey } from './nutrients'
import type { Journalpost } from './journal'
import type { Grovfoderanalys, Hastprofil } from './types'

export type ProfileField =
  | 'alderAr'
  | 'viktKg'
  | 'viktVidNormalHullKg'
  | 'hull'
  | 'ridning.passPerVecka'
  | 'ridning.minuterPerPass'
  | 'ridning.travGaloppMinPerPass'
  | 'miljo.timmarUtePerDag'
  | 'miljo.lagstaTempC'
  | 'grovfoder.kgPerDag'
  | `nuvarandeFoder.${number}.gramPerDag`

export type AnalysisField = 'tsProcent' | 'askaGPerKgTs' | `perKgTs.${NutrientKey}`

export type JournalField = 'datum' | 'viktKg' | 'hull'

/** One field the engine cannot calculate with, and why. */
export interface InputError {
  field: ProfileField | AnalysisField | JournalField
  message: ValidationMessage
}

// A real number only: saved JSON turns NaN into null, and null >= 0 is true, so a comparison alone would let it
// through to the engine as 0. NaN and Infinity are refused too.
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const inside = (v: number, { min, max }: Limit) => isNumber(v) && v >= min && v <= max
const range = ({ min, max }: Limit): ValidationMessage => ({ code: 'validation.range', params: { min, max } })

export function validateProfile(p: Hastprofil): InputError[] {
  const errors: InputError[] = []
  const check = (field: ProfileField, v: number, limit: Limit) => {
    if (!inside(v, limit)) errors.push({ field, message: range(limit) })
  }

  if (isNumber(p.alderAr) && p.alderAr < LIMITS.alderAr.min) {
    errors.push({
      field: 'alderAr',
      message: { code: 'validation.adultsOnly', params: { minAgeYears: LIMITS.alderAr.min } },
    })
  } else check('alderAr', p.alderAr, LIMITS.alderAr)
  check('viktKg', p.viktKg, LIMITS.viktKg)
  if (p.viktVidNormalHullKg !== undefined) check('viktVidNormalHullKg', p.viktVidNormalHullKg, LIMITS.viktKg)
  if (!Number.isInteger(p.hull) || !inside(p.hull, LIMITS.hull)) {
    errors.push({ field: 'hull', message: { code: 'validation.wholeRange', params: LIMITS.hull } })
  }

  if (p.ridning) {
    const { passPerVecka, minuterPerPass, travGaloppMinPerPass } = p.ridning
    check('ridning.passPerVecka', passPerVecka, LIMITS.passPerVecka)
    check('ridning.minuterPerPass', minuterPerPass, LIMITS.minuterPerPass)
    if (!inside(travGaloppMinPerPass, LIMITS.minuterPerPass)) {
      errors.push({ field: 'ridning.travGaloppMinPerPass', message: range(LIMITS.minuterPerPass) })
    } else if (inside(minuterPerPass, LIMITS.minuterPerPass) && travGaloppMinPerPass > minuterPerPass) {
      errors.push({ field: 'ridning.travGaloppMinPerPass', message: { code: 'validation.trotWithinRide', params: {} } })
    }
  }

  if (p.miljo) {
    check('miljo.timmarUtePerDag', p.miljo.timmarUtePerDag, LIMITS.timmarUtePerDag)
    check('miljo.lagstaTempC', p.miljo.lagstaTempC, LIMITS.lagstaTempC)
  }

  const kg = p.grovfoder.kgPerDag
  if (!(isNumber(kg) && kg > LIMITS.grovfoderKgPerDag.min && kg <= LIMITS.grovfoderKgPerDag.max)) {
    errors.push({
      field: 'grovfoder.kgPerDag',
      message: { code: 'validation.positiveUpTo', params: LIMITS.grovfoderKgPerDag },
    })
  }

  p.nuvarandeFoder.forEach((f, i) => check(`nuvarandeFoder.${i}.gramPerDag`, f.gramPerDag, LIMITS.gramPerDag))
  return errors
}

export function validateAnalysis(a: Grovfoderanalys): InputError[] {
  const errors: InputError[] = []
  if (!inside(a.tsProcent, LIMITS.tsProcent)) errors.push({ field: 'tsProcent', message: range(LIMITS.tsProcent) })
  if (a.askaGPerKgTs !== undefined && !inside(a.askaGPerKgTs, LIMITS.askaGPerKgTs)) {
    errors.push({ field: 'askaGPerKgTs', message: range(LIMITS.askaGPerKgTs) })
  }
  for (const [k, v] of Object.entries(a.perKgTs) as [NutrientKey, number | undefined][]) {
    if (v !== undefined && !(isNumber(v) && v >= 0)) {
      errors.push({ field: `perKgTs.${k}`, message: { code: 'validation.atLeast', params: { min: 0 } } })
    }
  }
  return errors
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** A stored date that is a real calendar day ("2026-02-30" is not). Checked in UTC, so no time zone is involved. */
function isCalendarDay(text: string): boolean {
  const m = ISO_DATE.exec(text)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

/**
 * A journal entry before it is saved (#107): it needs a real date, and a weight or condition within the profile's
 * limits, since saving it can update the profile.
 */
export function validateJournalpost(post: Pick<Journalpost, 'datum' | 'viktKg' | 'hull'>): InputError[] {
  const errors: InputError[] = []
  if (!isCalendarDay(post.datum)) errors.push({ field: 'datum', message: { code: 'validation.date', params: {} } })
  if (post.viktKg !== undefined && !inside(post.viktKg, LIMITS.viktKg)) {
    errors.push({ field: 'viktKg', message: range(LIMITS.viktKg) })
  }
  if (post.hull !== undefined && !(Number.isInteger(post.hull) && inside(post.hull, LIMITS.hull))) {
    errors.push({ field: 'hull', message: { code: 'validation.wholeRange', params: LIMITS.hull } })
  }
  return errors
}
