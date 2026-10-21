import { describe, expect, it } from 'vitest'
import { tillGrovfoderanalys, type AnalysisResult, type UtlastAnalys } from './analysis'

// Synthetic AI reply for a hay whose lab gives only ruminant energy and crude protein (DM 86 %):
// ruminant energy 7.6 / 0.86 = 8.84 MJ/kg DM, crude protein 78 / 0.86 = 90.7 g/kg DM, sugar 73 / 0.86 = 84.9 g/kg DM.
const hoBas: UtlastAnalys = {
  arAnalys: true,
  typ: 'ho',
  labb: 'Provlabbet Norr',
  provdatum: '2026-08-30',
  tsProcent: 86,
  perKgTs: { energi: null, energiIdisslare: 8.84, smbRp: null, raprotein: 90.7, socker: 84.9, ca: null },
  anmarkningar: [],
}

/** The converted analysis; fails the test when the result is an error. */
function converted(r: AnalysisResult) {
  if ('error' in r) throw new Error(`expected an analysis, got ${r.error.code}`)
  return r
}

describe('tillGrovfoderanalys', () => {
  it('räknar hästenergi och smb rp med SLU:s formler när labbet bara anger idisslarvärden', () => {
    const { analys, omrakningar } = converted(tillGrovfoderanalys(hoBas))
    expect(analys.perKgTs.energi).toBeCloseTo(8.8, 1) // 1.12 × 8.84 − 1.1
    expect(analys.perKgTs.smbRp).toBeCloseTo(54, 0) // (93.9 − 313/9.07) × 90.7 / 100
    expect(analys.perKgTs.ca).toBeUndefined() // a missing value stays unknown
    expect(omrakningar.map((o) => o.amne)).toEqual(['energi', 'smbRp'])
  })
  it('each conversion is a code with the raw source value, not a sentence (ADR 0014)', () => {
    expect(converted(tillGrovfoderanalys(hoBas)).omrakningar).toEqual([
      { amne: 'energi', message: { code: 'conversion.energyFromRuminant', params: { mj: 8.84 } } },
      { amne: 'smbRp', message: { code: 'conversion.proteinFromCrude', params: { grams: 90.7 } } },
    ])
  })
  it('behåller labbets hästvärden när de finns', () => {
    const { analys, omrakningar } = converted(
      tillGrovfoderanalys({ ...hoBas, perKgTs: { ...hoBas.perKgTs, energi: 9.1, smbRp: 60 } }),
    )
    expect(analys.perKgTs.energi).toBe(9.1)
    expect(analys.perKgTs.smbRp).toBe(60)
    expect(omrakningar).toEqual([])
  })
  it('a document that is not an analysis is a result with a code, not an exception (ADR 0013)', () => {
    expect(tillGrovfoderanalys({ ...hoBas, arAnalys: false })).toEqual({
      error: { code: 'analysis.notAnAnalysis', params: {} },
    })
  })
  it('an analysis without dry matter is a result with a code', () => {
    expect(tillGrovfoderanalys({ ...hoBas, tsProcent: null })).toEqual({
      error: { code: 'analysis.missingDryMatter', params: {} },
    })
  })
})
