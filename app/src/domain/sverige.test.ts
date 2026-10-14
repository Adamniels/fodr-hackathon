import { describe, expect, it } from 'vitest'
import { analysHo, analysKomplett } from '../data/exempel'
import { jamforMedSverige } from './sverige'

describe('jamforMedSverige', () => {
  it('A01 är rikssnittet och hamnar därför inom normalintervallet för alla värden', () => {
    const j = jamforMedSverige(analysKomplett)
    expect(j.grupp).toContain('blandvall')
    expect(j.n).toBe(1677)
    expect(j.rader.length).toBeGreaterThanOrEqual(12)
    expect(j.rader.filter((r) => r.lage !== 'normal')).toEqual([])
  })
  it('räknar om torrsubstans från g/kg vara till procent', () => {
    const ts = jamforMedSverige(analysKomplett).rader.find((r) => r.nyckel === 'TS')!
    expect(ts.medel).toBeCloseTo(39.68, 1)
    expect(ts.enhet).toBe('%')
  })
  it('märker energi och protein som approximerade', () => {
    const r = jamforMedSverige(analysKomplett).rader
    expect(r.find((x) => x.nyckel === 'OE')!.approximerad).toBe(true)
    expect(r.find((x) => x.nyckel === 'Ca')!.approximerad).toBe(false)
  })
  it('hö jämförs med blandvallshö; högt socker hamnar över P90', () => {
    const j = jamforMedSverige({ ...analysHo, perKgTs: { ...analysHo.perKgTs, socker: 200 } })
    expect(j.grupp).toContain('Hö')
    expect(j.rader.find((r) => r.nyckel === 'Socker')!.lage).toBe('hog')
  })
  it('hoppar över värden som saknas i analysen', () => {
    const j = jamforMedSverige({ ...analysKomplett, perKgTs: { energi: 10, smbRp: 100 } })
    expect(j.rader.map((r) => r.nyckel)).not.toContain('Se')
  })
})
