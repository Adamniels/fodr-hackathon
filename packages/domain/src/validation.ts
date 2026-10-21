// Validates a horse profile and an analysis against LIMITS (#13). The engine refuses input with errors (skapaPlan),
// and the web shows each error next to its field. A missing optional value is unknown, never an error and never 0.

import { LIMITS, type Limit } from './limits'
import type { ValidationMessage } from './messages'
import type { NutrientKey } from './nutrients'
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

/** One field the engine cannot calculate with, and why. */
export interface InputError {
  field: ProfileField | AnalysisField
  message: ValidationMessage
}

// NaN compares false with everything, so it is never inside a range.
const inside = (v: number, { min, max }: Limit) => v >= min && v <= max
const range = ({ min, max }: Limit): ValidationMessage => ({ code: 'validation.range', params: { min, max } })

export function validateProfile(p: Hastprofil): InputError[] {
  const errors: InputError[] = []
  const check = (field: ProfileField, v: number, limit: Limit) => {
    if (!inside(v, limit)) errors.push({ field, message: range(limit) })
  }

  if (p.alderAr < LIMITS.alderAr.min) {
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
    } else if (travGaloppMinPerPass > minuterPerPass) {
      errors.push({ field: 'ridning.travGaloppMinPerPass', message: { code: 'validation.trotWithinRide', params: {} } })
    }
  }

  if (p.miljo) {
    check('miljo.timmarUtePerDag', p.miljo.timmarUtePerDag, LIMITS.timmarUtePerDag)
    check('miljo.lagstaTempC', p.miljo.lagstaTempC, LIMITS.lagstaTempC)
  }

  const kg = p.grovfoder.kgPerDag
  if (!(kg > LIMITS.grovfoderKgPerDag.min && kg <= LIMITS.grovfoderKgPerDag.max)) {
    errors.push({
      field: 'grovfoder.kgPerDag',
      message: { code: 'validation.positiveUpTo', params: { max: LIMITS.grovfoderKgPerDag.max } },
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
    if (v !== undefined && !(v >= 0)) {
      errors.push({ field: `perKgTs.${k}`, message: { code: 'validation.atLeast', params: { min: 0 } } })
    }
  }
  return errors
}
