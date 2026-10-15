import { describe, expect, it } from 'vitest'
import produkterJson from '../data/products.json'
import { skapaInjustering, standardKanslighet } from './injustering'
import type { Produkt } from './types'

const produkter = produkterJson as Produkt[]
const frisk = { fang: false, ems: false, ovrigt: '' }

describe('injusteringsplan', () => {
  it('förväljer känslig för en häst med fång', () => {
    expect(standardKanslighet({ ...frisk, fang: true })).toBe('kanslig')
    expect(standardKanslighet(frisk)).toBe('normal')
  })

  it('trappar grovfoder och kraftfoder över hela perioden och slutar på den nya givan', () => {
    const pellets = produkter.find((p) => p.kategori === 'kraftfoder')!
    const mineral = produkter.find((p) => p.kategori === 'mineralfoder')!
    const inj = skapaInjustering({
      halsa: { ...frisk, fang: true },
      grovfoderNamn: 'Hösilage',
      grovfoderFranKg: 11,
      grovfoderTillKg: 15,
      fran: [{ produkt: pellets, gramPerDag: 1000 }],
      till: [{ produkt: mineral, gramPerDag: 100 }],
    })
    expect(inj.kanslighet).toBe('kanslig')
    expect(inj.forvald).toBe(true)
    expect(inj.dagar).toBe(14)
    expect(inj.steg.map((s) => s.startDag)).toEqual([1, 4, 7, 10, 13])
    const [grov, pell, min] = inj.rader
    expect(grov.perSteg).toEqual([12, 12.5, 13.5, 14, 15])
    expect(pell.perSteg).toEqual([800, 600, 400, 200, 0])
    expect(min.perSteg.at(-1)).toBe(100)
    for (const r of inj.rader) {
      for (let i = 1; i < r.perSteg.length; i++) {
        expect(Math.sign(r.perSteg[i] - r.perSteg[i - 1])).not.toBe(-Math.sign(r.till - r.fran))
      }
    }
  })

  it('går fortare för en häst som tål byten', () => {
    const inj = skapaInjustering({
      halsa: frisk,
      kanslighet: 'tal',
      grovfoderNamn: 'Hö',
      grovfoderFranKg: 8,
      grovfoderTillKg: 10,
      fran: [],
      till: [],
    })
    expect(inj.steg).toHaveLength(4)
    expect(inj.steg.at(-1)).toEqual({ nr: 4, startDag: 7, slutDag: null })
  })

  it('har inga rader när ingenting ändras', () => {
    const inj = skapaInjustering({
      halsa: frisk,
      grovfoderNamn: 'Hö',
      grovfoderFranKg: 10,
      grovfoderTillKg: 10.2,
      fran: [],
      till: [],
    })
    expect(inj.rader).toEqual([])
  })
})
