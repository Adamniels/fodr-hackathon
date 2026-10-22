// The seed writes through the repositories, not the routes, so its data must pass what the routes would check: the
// contract and the domain's validation (#29).
import { HorseProfileSchema } from '@fodr/contracts/horses'
import { validateAnalysis, validateJournalEntry, validateProfile } from '@fodr/domain/validation'
import { describe, expect, it } from 'vitest'
import { daysBefore } from './seed'
import { PYSEN, PYSEN_JOURNAL, SIXTEN, SIXTEN_ANALYSIS, SIXTEN_JOURNAL } from './seed-data'

describe('the seed data', () => {
  it.each([
    ['Sixten', SIXTEN],
    ['Pysen', PYSEN],
  ])('%s is a valid profile the plan can use', (_name, horse) => {
    expect(HorseProfileSchema.parse(horse)).toEqual(horse)
    expect(validateProfile({ ...horse, id: 'seed' })).toEqual([])
  })

  it("Sixten's analysis is one the plan can use", () => {
    expect(validateAnalysis(SIXTEN_ANALYSIS)).toEqual([])
  })

  it('the journal entries are valid on any day', () => {
    for (const entry of [...SIXTEN_JOURNAL, ...PYSEN_JOURNAL]) {
      const { viktKg, hull } = entry
      expect(validateJournalEntry({ datum: daysBefore('2026-10-15', entry.daysAgo), viktKg, hull })).toEqual([])
    }
  })
})
