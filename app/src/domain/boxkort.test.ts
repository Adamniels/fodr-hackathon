import { describe, expect, it } from 'vitest'
import { analysKomplett, demoHast } from '../data/exempel'
import produkterJson from '../data/products.json'
import { byggBoxkort } from './boxkort'
import { skapaPlan } from './plan'
import type { Produkt } from './types'

const plan = skapaPlan(demoHast, analysKomplett, produkterJson as Produkt[])
const kort = byggBoxkort(plan, 'hosilage')

describe('byggBoxkort', () => {
  it('delar grovfodret på morgon och kväll (SLU: minst två mål)', () => {
    expect(kort.rader[0]).toEqual({ namn: 'Hösilage', enhet: 'kg', morgon: 8, kvall: 8 })
  })
  it('mineralfoder ges på morgonen, salt delas', () => {
    const mineral = kort.rader.find((r) => r.namn.includes('Krafft Miner'))!
    expect(mineral.kvall).toBe(0)
    const salt = kort.rader.find((r) => r.namn.includes('Salt'))!
    expect(salt.morgon + salt.kvall).toBe(plan.urval!.poster.find((p) => p.produkt.kategori === 'salt')!.gramPerDag)
  })
  it('summan per dag stämmer med planen', () => {
    const iKort = kort.rader.slice(1).reduce((s, r) => s + r.morgon + r.kvall, 0)
    const iPlan = [...plan.behallnaFoder, ...plan.urval!.poster].reduce((s, p) => s + p.gramPerDag, 0)
    expect(iKort).toBe(iPlan)
  })
  it('visar vad som tas bort från dagens foder', () => {
    expect(kort.borttagna.some((n) => n.includes('Krafft Leisure'))).toBe(true)
  })
})
