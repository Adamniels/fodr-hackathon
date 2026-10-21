import { describe, expect, it } from 'vitest'
import { analysKomplett, demoHast } from '../test/fixtures/examples'
import produkterJson from '../test/fixtures/products.json'
import { skapaPlan } from './plan'
import type { Grovfoderanalys, Hastprofil, Produkt } from './types'
import { validateAnalysis, validateProfile } from './validation'

const produkter = produkterJson as Produkt[]

const range = (min: number, max: number) => ({ code: 'validation.range', params: { min, max } })

describe('validateProfile', () => {
  it('the demo horse is valid', () => {
    expect(validateProfile(demoHast)).toEqual([])
  })

  // Each field just inside and just outside its bounds (#13, decision 3).
  const fall: [string, Partial<Hastprofil>, Partial<Hastprofil>, unknown][] = [
    ['age below 3', { alderAr: 3 }, { alderAr: 2.9 }, { code: 'validation.adultsOnly', params: { minAgeYears: 3 } }],
    ['age above 40', { alderAr: 40 }, { alderAr: 40.5 }, range(3, 40)],
    ['weight below 50 kg', { viktKg: 50 }, { viktKg: 49 }, range(50, 1200)],
    ['weight above 1200 kg', { viktKg: 1200 }, { viktKg: 1201 }, range(50, 1200)],
    [
      'weight at normal condition below 50 kg',
      { viktVidNormalHullKg: 50 },
      { viktVidNormalHullKg: 0 },
      range(50, 1200),
    ],
    [
      'weight at normal condition above 1200 kg',
      { viktVidNormalHullKg: 1200 },
      { viktVidNormalHullKg: 1201 },
      range(50, 1200),
    ],
    ['condition below 1', { hull: 1 }, { hull: 0 }, { code: 'validation.wholeRange', params: { min: 1, max: 9 } }],
    ['condition above 9', { hull: 9 }, { hull: 10 }, { code: 'validation.wholeRange', params: { min: 1, max: 9 } }],
    ['condition not whole', { hull: 5 }, { hull: 5.5 }, { code: 'validation.wholeRange', params: { min: 1, max: 9 } }],
    [
      'roughage at 0 kg',
      { grovfoder: { typ: 'hosilage', kgPerDag: 0.1 } },
      { grovfoder: { typ: 'hosilage', kgPerDag: 0 } },
      { code: 'validation.positiveUpTo', params: { min: 0, max: 40 } },
    ],
    [
      'roughage above 40 kg',
      { grovfoder: { typ: 'hosilage', kgPerDag: 40 } },
      { grovfoder: { typ: 'hosilage', kgPerDag: 40.5 } },
      { code: 'validation.positiveUpTo', params: { min: 0, max: 40 } },
    ],
  ]
  it.each(fall)('%s', (_, inside, outside, message) => {
    expect(validateProfile({ ...demoHast, ...inside })).toEqual([])
    const fel = validateProfile({ ...demoHast, ...outside })
    expect(fel).toHaveLength(1)
    expect(fel[0].message).toEqual(message)
  })

  it('names the field of each error', () => {
    expect(
      validateProfile({ ...demoHast, viktKg: 0, grovfoder: { typ: 'ho', kgPerDag: -1 } }).map((f) => f.field),
    ).toEqual(['viktKg', 'grovfoder.kgPerDag'])
  })

  it('riding: sessions, minutes, and trot and canter within the session', () => {
    const ridning = (r: Partial<NonNullable<Hastprofil['ridning']>>) =>
      validateProfile({ ...demoHast, ridning: { passPerVecka: 4, minuterPerPass: 45, travGaloppMinPerPass: 15, ...r } })
    expect(ridning({ passPerVecka: 14, minuterPerPass: 300, travGaloppMinPerPass: 300 })).toEqual([])
    expect(ridning({ passPerVecka: 15 })).toEqual([{ field: 'ridning.passPerVecka', message: range(0, 14) }])
    expect(ridning({ passPerVecka: -1 })).toEqual([{ field: 'ridning.passPerVecka', message: range(0, 14) }])
    expect(ridning({ minuterPerPass: -1, travGaloppMinPerPass: 0 })).toEqual([
      { field: 'ridning.minuterPerPass', message: range(0, 300) },
    ])
    expect(ridning({ minuterPerPass: 301, travGaloppMinPerPass: 0 })).toEqual([
      { field: 'ridning.minuterPerPass', message: range(0, 300) },
    ])
    expect(ridning({ minuterPerPass: 45, travGaloppMinPerPass: 46 })).toEqual([
      { field: 'ridning.travGaloppMinPerPass', message: { code: 'validation.trotWithinRide', params: {} } },
    ])
    expect(ridning({ travGaloppMinPerPass: -1 })).toEqual([
      { field: 'ridning.travGaloppMinPerPass', message: range(0, 300) },
    ])
  })

  it('environment: hours outside and the lowest temperature', () => {
    const miljo = (m: Partial<NonNullable<Hastprofil['miljo']>>) =>
      validateProfile({ ...demoHast, miljo: { ...demoHast.miljo!, ...m } })
    expect(miljo({ timmarUtePerDag: 24, lagstaTempC: -50 })).toEqual([])
    expect(miljo({ lagstaTempC: 40 })).toEqual([])
    expect(miljo({ timmarUtePerDag: 0 })).toEqual([])
    expect(miljo({ timmarUtePerDag: -1 })).toEqual([{ field: 'miljo.timmarUtePerDag', message: range(0, 24) }])
    expect(miljo({ timmarUtePerDag: 25 })).toEqual([{ field: 'miljo.timmarUtePerDag', message: range(0, 24) }])
    expect(miljo({ lagstaTempC: -51 })).toEqual([{ field: 'miljo.lagstaTempC', message: range(-50, 40) }])
    expect(miljo({ lagstaTempC: 41 })).toEqual([{ field: 'miljo.lagstaTempC', message: range(-50, 40) }])
  })

  it('current feed: grams per day per row', () => {
    const rad = (gramPerDag: number) => ({ produktId: null, namn: 'Hemblandning', gramPerDag })
    expect(validateProfile({ ...demoHast, nuvarandeFoder: [rad(0), rad(20000)] })).toEqual([])
    expect(validateProfile({ ...demoHast, nuvarandeFoder: [rad(100), rad(20001), rad(-5)] })).toEqual([
      { field: 'nuvarandeFoder.1.gramPerDag', message: range(0, 20000) },
      { field: 'nuvarandeFoder.2.gramPerDag', message: range(0, 20000) },
    ])
  })

  it('the weight at normal condition is optional', () => {
    expect(validateProfile({ ...demoHast, viktVidNormalHullKg: undefined })).toEqual([])
  })

  // Saved JSON turns NaN into null, and null >= 0 is true in JavaScript; the engine would then read it as 0.
  it('null from saved data is an error, never 0', () => {
    const fran = (json: string) => JSON.parse(json) as never
    expect(validateProfile({ ...demoHast, viktKg: fran('null') })).toEqual([
      { field: 'viktKg', message: range(50, 1200) },
    ])
    expect(validateProfile({ ...demoHast, viktVidNormalHullKg: fran('null') })).toEqual([
      { field: 'viktVidNormalHullKg', message: range(50, 1200) },
    ])
    expect(validateProfile({ ...demoHast, miljo: { ...demoHast.miljo!, lagstaTempC: fran('null') } })).toEqual([
      { field: 'miljo.lagstaTempC', message: range(-50, 40) },
    ])
    expect(
      validateProfile({ ...demoHast, nuvarandeFoder: [{ produktId: null, namn: 'X', gramPerDag: fran('null') }] }),
    ).toEqual([{ field: 'nuvarandeFoder.0.gramPerDag', message: range(0, 20000) }])
    expect(
      validateProfile({
        ...demoHast,
        ridning: { passPerVecka: 3, minuterPerPass: 45, travGaloppMinPerPass: fran('null') },
      }),
    ).toEqual([{ field: 'ridning.travGaloppMinPerPass', message: range(0, 300) }])
  })

  it('a missing number is never treated as valid', () => {
    expect(validateProfile({ ...demoHast, viktKg: Number.NaN })).toEqual([
      { field: 'viktKg', message: range(50, 1200) },
    ])
    expect(validateProfile({ ...demoHast, alderAr: Number.POSITIVE_INFINITY })).toEqual([
      { field: 'alderAr', message: range(3, 40) },
    ])
  })
})

describe('validateAnalysis', () => {
  it('the complete example is valid', () => {
    expect(validateAnalysis(analysKomplett)).toEqual([])
  })

  it('dry matter 1 to 100 % (spec CF4)', () => {
    const ts = (tsProcent: number) => validateAnalysis({ ...analysKomplett, tsProcent })
    expect(ts(1)).toEqual([])
    expect(ts(100)).toEqual([])
    expect(ts(0.9)).toEqual([{ field: 'tsProcent', message: range(1, 100) }])
    expect(ts(100.1)).toEqual([{ field: 'tsProcent', message: range(1, 100) }])
  })

  it('ash 0 to 1000 g per kg DM, when given', () => {
    const aska = (askaGPerKgTs: number | undefined) => validateAnalysis({ ...analysKomplett, askaGPerKgTs })
    expect(aska(undefined)).toEqual([])
    expect(aska(0)).toEqual([])
    expect(aska(1000)).toEqual([])
    expect(aska(-1)).toEqual([{ field: 'askaGPerKgTs', message: range(0, 1000) }])
    expect(aska(1001)).toEqual([{ field: 'askaGPerKgTs', message: range(0, 1000) }])
    expect(aska(Number.NaN)).toEqual([{ field: 'askaGPerKgTs', message: range(0, 1000) }])
    expect(aska(JSON.parse('null') as never)).toEqual([{ field: 'askaGPerKgTs', message: range(0, 1000) }])
  })

  it('nutrients are not negative (spec CF4); a missing one is unknown, not an error', () => {
    const halter = (perKgTs: Grovfoderanalys['perKgTs']) => validateAnalysis({ ...analysKomplett, perKgTs })
    expect(halter({ energi: 0, ca: undefined })).toEqual([])
    expect(halter({ energi: 10, ca: -0.1 })).toEqual([
      { field: 'perKgTs.ca', message: { code: 'validation.atLeast', params: { min: 0 } } },
    ])
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, JSON.parse('null') as never]) {
      expect(halter({ smbRp: v })).toEqual([
        { field: 'perKgTs.smbRp', message: { code: 'validation.atLeast', params: { min: 0 } } },
      ])
    }
    expect(validateAnalysis({ ...analysKomplett, tsProcent: JSON.parse('null') as never })).toEqual([
      { field: 'tsProcent', message: range(1, 100) },
    ])
  })
})

describe('skapaPlan refuses invalid input (C1)', () => {
  it('the audit probe: a 0 kg horse gets errors, not a plan', () => {
    expect(skapaPlan({ ...demoHast, viktKg: 0 }, analysKomplett, produkter)).toEqual({
      errors: [{ field: 'viktKg', message: range(50, 1200) }],
    })
  })

  it('the audit probe: NaN dry matter gets errors, not a plan', () => {
    expect(skapaPlan(demoHast, { ...analysKomplett, tsProcent: Number.NaN }, produkter)).toEqual({
      errors: [{ field: 'tsProcent', message: range(1, 100) }],
    })
  })

  it('a young horse gets the adults-only error, which used to be thrown', () => {
    expect(skapaPlan({ ...demoHast, alderAr: 2 }, analysKomplett, produkter)).toEqual({
      errors: [{ field: 'alderAr', message: { code: 'validation.adultsOnly', params: { minAgeYears: 3 } } }],
    })
  })

  it('valid input gets a plan', () => {
    const r = skapaPlan(demoHast, analysKomplett, produkter)
    expect('plan' in r && r.plan.resultat.length).toBeGreaterThan(0)
  })
})
