import { describe, expect, it } from 'vitest'
import { NUTRIENTS, NUTRIENT_KEYS } from './nutrients'

describe('NUTRIENTS', () => {
  it('a nutrient is data: unit and group, with its name in the web catalogue (ADR 0014)', () => {
    for (const k of NUTRIENT_KEYS) expect([k, Object.keys(NUTRIENTS[k]).sort()]).toEqual([k, ['group', 'unit']])
  })
})
