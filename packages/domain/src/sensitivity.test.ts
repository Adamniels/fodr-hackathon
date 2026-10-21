import { describe, expect, it } from 'vitest'
import { analysKomplett, demoHast } from '../test/fixtures/examples'
import produkterJson from '../test/fixtures/products.json'
import { filtreraProdukter, granskaKansligheter, skalMotProdukt } from './sensitivity'
import { skapaPlan } from './plan'
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
    expect(skalMotProdukt(hitta(LEISURE), { ...frisk, magsar: true }).join()).toContain('magsår')
  })
  it('PPID behandlas som EMS', () => {
    expect(skalMotProdukt(hitta(LEISURE), { ...frisk, ppid: true }).join()).toContain('socker')
  })
  it('luftvägar: pulver', () => {
    expect(skalMotProdukt(hitta(FODERKRITA), { ...frisk, luftvagar: true })).toContain('pulverform kan damma')
  })
  it('allergi: lusern', () => {
    expect(skalMotProdukt(hitta(LUSERN), { ...frisk, undvik: ['lusern'] })).toContain('innehåller lusern')
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
    expect(rader.some((r) => r.niva === 'varning' && r.text.includes('Krafft Leisure'))).toBe(true)
    expect(rader.some((r) => r.text.includes('750 g stärkelse per mål'))).toBe(true) // 150 g × 5
  })
  it('proteinkänslig: varnar för överskott över 30 %', () => {
    const rader = granskaKansligheter({ ...frisk, proteinkanslig: true }, [], { intag: 660, behov: 390 }, 500)
    expect(rader.some((r) => r.text.includes('69 % mer protein'))).toBe(true)
  })
})

describe('planen med känsligheter', () => {
  it('Sixten: vitamin E styr urvalet, så inget sommarmineral utan vitaminer', () => {
    const plan = skapaPlan(demoHast, analysKomplett, produkter)
    expect(plan.urval!.poster.some((p) => p.produkt.namn.includes('Summer'))).toBe(false)
    expect(plan.resultat.find((r) => r.amne === 'vitE')!.status).toBe('ok')
  })
  it('luftvägar: inget pulver i förslaget och bortvalda urvalsprodukter redovisas', () => {
    const plan = skapaPlan({ ...demoHast, halsa: { ...demoHast.halsa, luftvagar: true } }, analysKomplett, produkter)
    expect(plan.urval!.poster.every((p) => p.produkt.form !== 'pulver')).toBe(true)
    expect(plan.bortvalda.some((b) => b.namn.includes('Foderkrita'))).toBe(true)
  })
})
