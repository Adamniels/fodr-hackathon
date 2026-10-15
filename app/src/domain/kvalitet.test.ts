import { describe, expect, it } from 'vitest'
import { analysHo, analysKomplett, demoHast, ponny } from '../data/exempel'
import { bedomGrovfoder } from './kvalitet'

const rubriker = (f: ReturnType<typeof bedomGrovfoder>) => f.map((x) => x.rubrik)

describe('bedomGrovfoder', () => {
  it('A01: proteinrikt, energirikt och blött för en fritidshäst', () => {
    // Kvot 104 / 10,2 = 10,2 > 6, energi 10,2 > 8, ts 39,7 < 45 (SLU tabell 32 och sid 30).
    const f = rubriker(bedomGrovfoder(analysKomplett, demoHast))
    expect(f).toContain('Mer protein än hästen behöver')
    expect(f).toContain('Energirikt grovfoder')
    expect(f).toContain('Blött hösilage')
    expect(f).not.toContain('Möjlig jordinblandning')
  })
  it('A07: kvot 5,2 ligger inom SLU:s 5–6, selen saknas', () => {
    const f = rubriker(bedomGrovfoder(analysHo, ponny))
    expect(f).not.toContain('Proteinfattigt grovfoder')
    expect(f).toContain('Selen ej analyserat')
    // Pysen har EMS, så sockret varnas i planen i stället för här.
    expect(f).not.toContain('Högt socker')
  })
  it('B06: hög aska och järn tyder på jordinblandning', () => {
    const b06 = {
      ...analysKomplett,
      tsProcent: 45.7,
      askaGPerKgTs: 94,
      perKgTs: { ...analysKomplett.perKgTs, fe: 279 },
    }
    expect(rubriker(bedomGrovfoder(b06, demoHast))).toContain('Möjlig jordinblandning')
  })
  it('hårt arbete: energi under 9 MJ är för lite', () => {
    const f = rubriker(bedomGrovfoder(analysHo, { ...demoHast, prestanda: 'trav_galopp_traning' }))
    expect(f).toContain('Energifattigt grovfoder')
  })
})
