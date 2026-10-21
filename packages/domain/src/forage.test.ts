import { describe, expect, it } from 'vitest'
import { hittaSchablon } from './forage'
import { NUTRIENT_KEYS } from './nutrients'
import type { Grovfodertyp } from './types'

describe('hittaSchablon', () => {
  it('each estimate cites its source as a code, not a sentence (ADR 0014)', () => {
    expect(hittaSchablon('ho', 'ca')).toEqual({ varde: 3.5, kalla: { code: 'source.typicalForage', params: {} } })
    expect(hittaSchablon('ho', 'fe')?.kalla).toEqual({ code: 'source.table26Timothy', params: {} })
    expect(hittaSchablon('ho', 'se')?.kalla).toEqual({ code: 'source.typicalForageLowSelenium', params: {} })
    expect(hittaSchablon('ho', 'starkelse')?.kalla).toEqual({ code: 'source.table29Grass', params: {} })
    expect(hittaSchablon('hosilage', 'vitA')?.kalla).toEqual({ code: 'source.table24CaroteneLower', params: {} })
    expect(hittaSchablon('hosilage', 'vitE')?.kalla).toEqual({ code: 'source.table24Lower', params: {} })
    expect(hittaSchablon('ho', 'vitD')?.kalla).toEqual({ code: 'source.table24FieldDriedHay', params: {} })
    expect(hittaSchablon('ho', 'vitE')?.kalla).toEqual({ code: 'source.table24', params: {} })
  })
  it('every estimate for hay and haylage carries a source code', () => {
    for (const typ of ['ho', 'hosilage'] as Grovfodertyp[])
      for (const k of NUTRIENT_KEYS) {
        const s = hittaSchablon(typ, k)
        if (s) expect([typ, k, s.kalla.code.startsWith('source.')]).toEqual([typ, k, true])
      }
  })
})
