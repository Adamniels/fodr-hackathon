import { describe, expect, it } from 'vitest'
import { analysHo, analysKomplett, demoHast, ponny } from '../test/fixtures/examples'
import { bedomGrovfoder } from './quality'

const koder = (f: ReturnType<typeof bedomGrovfoder>) => f.map((x) => x.text.code)

describe('bedomGrovfoder', () => {
  it('A01: proteinrikt, energirikt och blött för en fritidshäst', () => {
    // Kvot 104 / 10,2 = 10,2 > 6, energi 10,2 > 8, ts 39,7 < 45 (SLU tabell 32 och sid 30).
    const f = koder(bedomGrovfoder(analysKomplett, demoHast))
    expect(f).toContain('quality.proteinHigh')
    expect(f).toContain('quality.energyHigh')
    expect(f).toContain('quality.haylageWet')
    expect(f.filter((k) => k.startsWith('quality.soil'))).toEqual([])
  })
  it('A01: flaggorna bär rubrik, råa tal och källa som koder (ADR 0014)', () => {
    const [protein] = bedomGrovfoder(analysKomplett, demoHast)
    expect(protein).toEqual({
      niva: 'info',
      rubrik: { code: 'qualityTitle.proteinHigh', params: {} },
      text: { code: 'quality.proteinHigh', params: { ratio: 104 / 10.2, min: 5, max: 6, group: 'ovriga' } },
      kalla: { code: 'source.table32', params: {} },
    })
  })
  it('A07: kvot 5,2 ligger inom SLU:s 5–6, selen saknas', () => {
    const f = koder(bedomGrovfoder(analysHo, ponny))
    expect(f).not.toContain('quality.proteinLow')
    expect(f).toContain('quality.seleniumMissing')
    // Pysen har EMS, så sockret varnas i planen i stället för här.
    expect(f).not.toContain('quality.sugarHigh')
  })
  it('B06: hög aska och järn tyder på jordinblandning', () => {
    const b06 = {
      ...analysKomplett,
      tsProcent: 45.7,
      askaGPerKgTs: 94,
      perKgTs: { ...analysKomplett.perKgTs, fe: 279 },
    }
    expect(bedomGrovfoder(b06, demoHast).find((x) => x.text.code.startsWith('quality.soil'))).toMatchObject({
      rubrik: { code: 'qualityTitle.soil' },
      text: { code: 'quality.soilAshIron', params: { ashG: 94, ironMg: 279 } },
      kalla: { code: 'source.eurofinsSoil' },
    })
  })
  it('hårt arbete: energi under 9 MJ är för lite', () => {
    const f = bedomGrovfoder(analysHo, { ...demoHast, prestanda: 'trav_galopp_traning' })
    expect(f.find((x) => x.text.code === 'quality.energyLow')!.text.params).toMatchObject({ min: 9, group: 'hart' })
  })
})
