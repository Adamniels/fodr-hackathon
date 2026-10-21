import { describe, expect, it } from 'vitest'
import { analysKomplett, demoHast } from '../test/fixtures/examples'
import produkterJson from '../test/fixtures/products.json'
import { filtreraProdukter, granskaKansligheter, skalMotProdukt } from './sensitivity'
import { planFor } from '../test/plan'
import type { Halsa, Produkt } from './types'

const produkter = produkterJson as Produkt[]
const hitta = (id: string) => produkter.find((p) => p.id === id)!
const frisk: Halsa = { fang: false, ems: false, ovrigt: '' }

const LEISURE = 'gg-1235447' // Krafft Leisure Pellets, stärkelse 210 g/kg
const FODERKRITA = 'gg-1011686' // pulver
const LUSERN = 'gg-2002027' // Krafft Lucerne Pellets

describe('skalMotProdukt', () => {
  it('frisk häst: inget talar emot', () => {
    expect(skalMotProdukt(hitta(LEISURE), frisk)).toEqual([])
  })
  it('magsår: kraftfoder med mycket stärkelse', () => {
    expect(skalMotProdukt(hitta(LEISURE), { ...frisk, magsar: true })).toContainEqual({
      code: 'exclusion.grainOrStarch',
      params: {},
    })
  })
  it('PPID behandlas som EMS', () => {
    expect(skalMotProdukt(hitta(LEISURE), { ...frisk, ppid: true })).toContainEqual({
      code: 'exclusion.sugarStarch',
      params: {},
    })
  })
  it('luftvägar: pulver', () => {
    expect(skalMotProdukt(hitta(FODERKRITA), { ...frisk, luftvagar: true })).toContainEqual({
      code: 'exclusion.powder',
      params: {},
    })
  })
  it('allergi: lusern', () => {
    expect(skalMotProdukt(hitta(LUSERN), { ...frisk, undvik: ['lusern'] })).toContainEqual({
      code: 'exclusion.containsIngredient',
      params: { ingredient: 'lusern' },
    })
  })
})

describe('filtrering och granskning', () => {
  it('bortvalda produkter når aldrig urvalet', () => {
    const { tillatna, uteslutna } = filtreraProdukter(produkter, { ...frisk, luftvagar: true })
    expect(tillatna.some((p) => p.id === FODERKRITA)).toBe(false)
    expect(uteslutna.some((u) => u.produkt.id === FODERKRITA)).toBe(true)
  })
  it('varnar för dagens foder vid magsår och ger råd om stärkelse per mål', () => {
    const rader = granskaKansligheter(
      { ...frisk, magsar: true },
      [{ produkt: hitta(LEISURE), gramPerDag: 1000 }],
      { intag: 400, behov: 390 },
      500,
    )
    expect(rader).toContainEqual({
      niva: 'varning',
      text: {
        code: 'sensitivity.currentFeed',
        params: { product: hitta(LEISURE).namn, reasons: [{ code: 'exclusion.grainOrStarch', params: {} }] },
      },
      kalla: { code: 'source.fodrRules', params: {} },
    })
    // 150 g × 5
    expect(rader).toContainEqual({
      niva: 'info',
      text: { code: 'sensitivity.ulcer', params: { starchPerMealG: 750 } },
      kalla: { code: 'source.concentrateGuidelinesPage33', params: {} },
    })
  })
  it('proteinkänslig: varnar för överskott över 30 %', () => {
    const rader = granskaKansligheter({ ...frisk, proteinkanslig: true }, [], { intag: 660, behov: 390 }, 500)
    expect(rader.map((r) => r.text)).toContainEqual({ code: 'sensitivity.proteinExcess', params: { percent: 69 } })
  })
})

describe('råd utan tal', () => {
  it('korsförlamning, luftvägar, tänder och undvikna ingredienser ger kod och källa', () => {
    const rader = granskaKansligheter(
      { ...frisk, pssm: true, luftvagar: true, tandproblem: true, undvik: ['spannmål', 'melass'] },
      [],
      { intag: 400, behov: 390 },
      500,
    )
    expect(rader.map((r) => [r.text, r.kalla])).toEqual([
      [
        { code: 'sensitivity.pssm', params: {} },
        { code: 'source.industryPractice', params: {} },
      ],
      [
        { code: 'sensitivity.airways', params: {} },
        { code: 'source.page30', params: {} },
      ],
      [
        { code: 'sensitivity.teeth', params: {} },
        { code: 'source.industryPracticePage34', params: {} },
      ],
      [
        { code: 'sensitivity.avoidedIngredients', params: { ingredients: ['spannmål', 'melass'] } },
        { code: 'source.productDescriptions', params: {} },
      ],
    ])
  })
})

describe('planen med känsligheter', () => {
  it('Sixten: vitamin E styr urvalet, så inget sommarmineral utan vitaminer', () => {
    const plan = planFor(demoHast, analysKomplett, produkter)
    expect(plan.urval!.poster.some((p) => p.produkt.namn.includes('Summer'))).toBe(false)
    expect(plan.resultat.find((r) => r.amne === 'vitE')!.status).toBe('ok')
  })
  it('luftvägar: inget pulver i förslaget och bortvalda urvalsprodukter redovisas', () => {
    const plan = planFor({ ...demoHast, halsa: { ...demoHast.halsa, luftvagar: true } }, analysKomplett, produkter)
    expect(plan.urval!.poster.every((p) => p.produkt.form !== 'pulver')).toBe(true)
    expect(plan.bortvalda.some((b) => b.namn.includes('Foderkrita'))).toBe(true)
  })
})
