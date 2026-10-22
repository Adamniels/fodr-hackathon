import { describe, expect, it } from 'vitest'
import { HorseProfileSchema } from './horses'

const PROFILE = {
  namn: 'Pysen',
  alderAr: 22,
  kon: 'sto',
  typ: 'lattfodd',
  viktKg: 280,
  hull: 5,
  halsa: { fang: false, ems: true, ovrigt: '' },
  grovfoder: { typ: 'ho', kgPerDag: 6 },
  nuvarandeFoder: [],
}

describe('HorseProfileSchema', () => {
  it('accepts a profile and drops fields outside the contract, such as an id', () => {
    expect(HorseProfileSchema.parse({ ...PROFILE, id: 'x' })).toEqual(PROFILE)
  })

  it("accepts a value out of range: ranges are the engine's", () => {
    expect(HorseProfileSchema.safeParse({ ...PROFILE, viktKg: 0 }).success).toBe(true)
  })

  it('refuses NaN, Infinity and text for a number', () => {
    for (const viktKg of [Number.NaN, Number.POSITIVE_INFINITY, '280']) {
      expect(HorseProfileSchema.safeParse({ ...PROFILE, viktKg }).success).toBe(false)
    }
  })
})
