import { describe, expect, it } from 'vitest'
import { tillGrovfoderanalys, type UtlastAnalys } from './analysis'

// Syntetiskt AI-svar för ett hö där labbet bara anger idisslarenergi och råprotein (ts 86 %):
// energi idisslare 7,6 / 0,86 = 8,84 MJ/kg ts, råprotein 78 / 0,86 = 90,7 g/kg ts, socker 73 / 0,86 = 84,9 g/kg ts.
const hoBas: UtlastAnalys = {
  arAnalys: true,
  typ: 'ho',
  labb: 'Provlabbet Norr',
  provdatum: '2026-08-30',
  tsProcent: 86,
  perKgTs: { energi: null, energiIdisslare: 8.84, smbRp: null, raprotein: 90.7, socker: 84.9, ca: null },
  anmarkningar: [],
}

describe('tillGrovfoderanalys', () => {
  it('räknar hästenergi och smb rp med SLU:s formler när labbet bara anger idisslarvärden', () => {
    const { analys, omrakningar } = tillGrovfoderanalys(hoBas)
    expect(analys.perKgTs.energi).toBeCloseTo(8.8, 1) // 1,12 × 8,84 − 1,1
    expect(analys.perKgTs.smbRp).toBeCloseTo(54, 0) // (93,9 − 313/9,07) × 90,7 / 100
    expect(analys.perKgTs.ca).toBeUndefined() // saknat värde förblir okänt
    expect(omrakningar.map((o) => o.amne)).toEqual(['energi', 'smbRp'])
  })
  it('behåller labbets hästvärden när de finns', () => {
    const { analys, omrakningar } = tillGrovfoderanalys({
      ...hoBas,
      perKgTs: { ...hoBas.perKgTs, energi: 9.1, smbRp: 60 },
    })
    expect(analys.perKgTs.energi).toBe(9.1)
    expect(analys.perKgTs.smbRp).toBe(60)
    expect(omrakningar).toEqual([])
  })
  it('stoppar dokument som inte är analyser', () => {
    expect(() => tillGrovfoderanalys({ ...hoBas, arAnalys: false })).toThrow()
  })
})
