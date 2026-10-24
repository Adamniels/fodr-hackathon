import { describe, expect, it } from 'vitest'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import { NUTRIENT_KEYS } from '@fodr/domain/nutrients'
import { analysisChanges, horseChanges } from './conflict-fields'
import { formatNumber } from './format'

// Every field of the profile set, the optional ones too, so a change to each is named.
const FULL: Hastprofil = {
  id: 'h',
  namn: 'Sixten',
  alderAr: 12,
  kon: 'valack',
  typ: 'normalfodd',
  viktKg: 550,
  hull: 5,
  viktVidNormalHullKg: 540,
  ras: 'islandshast',
  ridning: { passPerVecka: 4, minuterPerPass: 45, travGaloppMinPerPass: 15 },
  arbetsniva: 'latt',
  prestanda: 'fritid',
  miljo: { hallning: 'box', timmarUtePerDag: 8, klippt: false, tacke: true, lagstaTempC: -5 },
  halsa: {
    fang: true,
    ems: false,
    ppid: false,
    magsar: false,
    pssm: false,
    luftvagar: false,
    tandproblem: false,
    proteinkanslig: false,
    undvik: ['soja'],
    ovrigt: 'Lugn',
  },
  bytekanslighet: 'kanslig',
  grovfoder: { typ: 'hosilage', kgPerDag: 10 },
  nuvarandeFoder: [{ produktId: null, namn: 'Pellets', gramPerDag: 1000 }],
}

// A field named by its path rather than its label: lower case first, as the contract's field names are.
const PATH = /^[a-z][a-zA-Z]*(\.[a-zA-Z]+)*$/

/** Every leaf of a record changed: numbers up, booleans flipped, text and lists replaced. */
function changedEverywhere(value: unknown): unknown {
  if (Array.isArray(value)) return []
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, changedEverywhere(v)]))
  if (typeof value === 'number') return value + 1
  if (typeof value === 'boolean') return !value
  return `${String(value)}x`
}

describe('the changes a conflict notice shows (#140)', () => {
  it('names every field of the profile by its label, never by its path', () => {
    const changes = horseChanges(FULL, { ...(changedEverywhere(FULL) as Hastprofil), id: 'h' })
    expect(changes.length).toBeGreaterThan(30)
    for (const c of changes) expect(c.field, c.field).not.toMatch(PATH)
  })

  it('shows each value as the form does, and a missing one as missing', () => {
    const changes = horseChanges(
      { ...FULL, viktKg: 550, halsa: { ...FULL.halsa, fang: true }, kon: 'valack', bytekanslighet: undefined },
      { ...FULL, viktKg: 545.5, halsa: { ...FULL.halsa, fang: false }, kon: 'sto', bytekanslighet: 'tal' },
    )
    expect(changes).toEqual([
      { field: 'Kön', theirs: 'Sto', mine: 'Valack' },
      { field: 'Vikt (kg)', theirs: '545,5', mine: '550' },
      { field: 'Har haft fång', theirs: 'nej', mine: 'ja' },
      { field: 'Känslighet för foderbyten', theirs: 'Tål byten bra', mine: 'inget värde' },
    ])
  })

  it('shows the feeds of today as one value', () => {
    const [change] = horseChanges(FULL, {
      ...FULL,
      nuvarandeFoder: [{ produktId: null, namn: 'Pellets', gramPerDag: 900 }],
    })
    expect(change).toEqual({
      field: 'Foder i dag',
      theirs: 'Pellets 900 g',
      mine: `Pellets ${formatNumber(1000, 0)} g`,
    })
  })

  it('names every value of the analysis, each nutrient by its name', () => {
    const analys: Grovfoderanalys = {
      typ: 'hosilage',
      labb: 'Eurofins',
      provdatum: '2026-06-01',
      tsProcent: 55,
      askaGPerKgTs: 80,
      perKgTs: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 1])),
    }
    const changes = analysisChanges(analys, changedEverywhere(analys) as Grovfoderanalys)
    expect(changes).toHaveLength(5 + NUTRIENT_KEYS.length)
    for (const c of changes) expect(c.field, c.field).not.toMatch(PATH)
    expect(changes.find((c) => c.field === 'Torrsubstans')).toEqual({
      field: 'Torrsubstans',
      theirs: '56',
      mine: '55',
    })
  })
})
