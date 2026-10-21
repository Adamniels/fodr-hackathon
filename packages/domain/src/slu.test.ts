import { describe, expect, it } from 'vitest'
import { demoHast, ponny } from '../test/fixtures/examples'
import { beraknaBehov } from './slu'

describe('kyla (SLU sid 15, regel 1)', () => {
  // Pysen: 280 kg lättfödd, hull 5, lätt arbete (25 %), lösdrift, oklippt, utan täcke, −20 °C.
  // Underhåll 0,5 × 280^0,75 = 34,2 MJ. Arbete 8,6 MJ. Kyla 0,027 × 5 × 34,2 = 4,6 MJ. Totalt 47,4 MJ.
  // Protein 6 × (34,2 + 8,6) = 257 g, kyla ger inget proteintillägg.
  const r = beraknaBehov(ponny)
  it('ger kylatillägg för oklippt häst utan täcke under −15 °C', () => {
    expect(r.underhallMJ).toBeCloseTo(34.2, 1)
    expect(r.kylaMJ).toBeCloseTo(4.6, 1)
    expect(r.behov.energi.min).toBeCloseTo(47.4, 0)
    expect(r.behov.smbRp.min).toBeCloseTo(257, -1)
  })
  it('ger inget tillägg med täcke', () => {
    const medTacke = beraknaBehov({ ...ponny, miljo: { ...ponny.miljo!, tacke: true } })
    expect(medTacke.kylaMJ).toBe(0)
  })
  it('ger inget tillägg för arbetande häst, bara en notering', () => {
    const arbetar = beraknaBehov({ ...ponny, arbetsniva: 'hart' })
    expect(arbetar.kylaMJ).toBe(0)
    expect(arbetar.noteringar).toContainEqual({ code: 'note.coldWorking', params: {} })
  })
})

describe('prestanda (SLU tabell 9–11)', () => {
  const bas = { ...demoHast, viktKg: 500, hull: 5, ridning: undefined, miljo: undefined }
  it('travhäst i träning: minst 11 MJ per 100 kg, hårt arbete styr vitaminer och salt', () => {
    const r = beraknaBehov({ ...bas, prestanda: 'trav_galopp_traning' })
    expect(r.arbetsMJ).toBeCloseTo(55, 0)
    expect(r.behov.vitE!.min).toBeCloseTo(200 * 5, 0) // tabell 18, hårt arbetande
    expect(r.behov.na!.min).toBeCloseTo(13 * 0.393 * 5, 1) // tabell 15, 75–130 %
    expect(r.noteringar).toContainEqual({ code: 'note.sweatSalt', params: {} })
  })
  it('ridpassen vinner om de ger mer än grenens miniminivå', () => {
    const pass = beraknaBehov({
      ...bas,
      prestanda: 'fritid',
      ridning: { passPerVecka: 6, minuterPerPass: 90, travGaloppMinPerPass: 40 },
    })
    expect(pass.arbetsMJ).toBeGreaterThan(0)
    const lokal = beraknaBehov({
      ...bas,
      prestanda: 'tavling_lokal',
      ridning: { passPerVecka: 1, minuterPerPass: 30, travGaloppMinPerPass: 5 },
    })
    expect(lokal.arbetsProcent).toBeCloseTo(40, 0)
  })
})

describe('ras (SLU tabell 33)', () => {
  it('varnar när vikten ligger långt utanför rasens intervall', () => {
    const r = beraknaBehov({ ...ponny, ras: 'shetland' })
    expect(r.noteringar).toContainEqual({
      code: 'note.weightOutsideBreed',
      params: { kg: 280, breedId: 'shetland', minKg: 100, maxKg: 200 },
    })
  })
  it('varnar inte inom intervallet', () => {
    expect(beraknaBehov(ponny).noteringar.map((n) => n.code)).not.toContain('note.weightOutsideBreed')
  })
})

describe('meddelanden (ADR 0014)', () => {
  it('kylatillägget som kod med MJ och grader under gränsen', () => {
    const kyla = beraknaBehov(ponny).noteringar.find((n) => n.code === 'note.coldSupplement')
    expect(kyla?.code === 'note.coldSupplement' && kyla.params.degreesBelow).toBe(5)
    expect(kyla?.code === 'note.coldSupplement' && kyla.params.mj).toBeCloseTo(4.6, 1)
  })
  it('vikt vid normalt hull, äldre häst och lösdrift som koder', () => {
    expect(beraknaBehov(demoHast).noteringar).toContainEqual({
      code: 'note.normalConditionWeight',
      params: { kg: expect.closeTo(506, 0) as number },
    })
    const koder = beraknaBehov(ponny).noteringar.map((n) => n.code)
    expect(koder).toContain('note.senior')
    expect(koder).toContain('note.looseHousing')
  })
  it('arbetstillägg från gren och nivå som kod', () => {
    const r = beraknaBehov({ ...demoHast, ridning: undefined, prestanda: 'tavling_hog' })
    expect(r.noteringar).toContainEqual({ code: 'note.workFromDiscipline', params: {} })
  })
  it('källorna är data: tabell och rad', () => {
    const { behov } = beraknaBehov(demoHast)
    expect(behov.energi.kalla).toEqual({ code: 'source.energy', params: {} })
    expect(behov.smbRp.kalla).toEqual({ code: 'source.proteinPerMJ', params: {} })
    expect(behov.ca!.kalla).toEqual({ code: 'source.macroMinerals', params: { level: 'arbeteUnder30' } })
    expect(behov.na!.kalla).toEqual({ code: 'source.sodium', params: { level: 'arbeteUnder30' } })
    expect(behov.starkelse!.kalla).toEqual({ code: 'source.concentrateGuidelines', params: {} })
    expect(behov.se!.kalla).toEqual({ code: 'source.microMinerals', params: { level: 'underhall' } })
    expect(behov.vitE!.kalla).toEqual({ code: 'source.vitamins', params: {} })
  })
})
