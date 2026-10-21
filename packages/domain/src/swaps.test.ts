import { describe, expect, it } from 'vitest'
import { analysKomplett, demoHast } from '../test/fixtures/examples'
import produkterJson from '../test/fixtures/products.json'
import { hittaBilligareLiknande } from './swaps'
import { monthlyCost, displayName } from './intake'
import { skapaPlan } from './plan'
import type { Produkt } from './types'

const produkter = produkterJson as Produkt[]
const hitta = (namn: string) => produkter.find((p) => p.namn.includes(namn))!

describe('billigare liknande foder', () => {
  it('byter ett dyrt kraftfoder mot ett liknande billigare med samma energi', () => {
    const fran = { produkt: hitta('Krafft Senior Pellets'), gramPerDag: 1000 }
    const b = hittaBilligareLiknande(fran, produkter, { fang: false, ems: false, ovrigt: '' })!
    expect(b).not.toBeNull()
    expect(b.kostnadEfter).toBeLessThan(b.kostnadFore)
    const energiFore = (fran.produkt.perKg.energi! * fran.gramPerDag) / 1000
    const energiEfter = (b.till.produkt.perKg.energi! * b.till.gramPerDag) / 1000
    expect(Math.abs(energiEfter / energiFore - 1)).toBeLessThan(0.02)
    expect(b.skal).toEqual({ code: 'swapReason.sameEnergy', params: {} })
  })

  it('föreslår inget fångolämpligt foder i stället för ett fånglämpligt', () => {
    const fran = { produkt: hitta('Pavo Care4Life'), gramPerDag: 1000 }
    const b = hittaBilligareLiknande(fran, produkter, { fang: false, ems: false, ovrigt: '' })
    if (b) expect(b.till.produkt.lampligVidFangEms).toBe(true)
  })

  it('planen visar bytet, använder den nya produkten och blir billigare', () => {
    const hast = {
      ...demoHast,
      nuvarandeFoder: [{ produktId: hitta('Krafft Senior Pellets').id, namn: 'Senior', gramPerDag: 800 }],
    }
    const plan = skapaPlan(hast, analysKomplett, produkter)
    const behallen = plan.behallnaFoder.find((p) => p.produkt.kategori === 'kraftfoder')
    if (behallen) {
      expect(plan.byten.length).toBeGreaterThan(0)
      expect(plan.atgarder.some((a) => a.typ === 'byt')).toBe(true)
      expect(monthlyCost(behallen.produkt, behallen.gramPerDag)).toBeLessThan(
        monthlyCost(hitta('Krafft Senior Pellets'), 800),
      )
    }
  })

  it('ett mineralfoder som inte väljs syns som byte eller borttagning, aldrig tyst', () => {
    const mineral = hitta('Krafft Miner VitaMinerals Pellets 20kg')
    const hast = { ...demoHast, nuvarandeFoder: [{ produktId: mineral.id, namn: mineral.namn, gramPerDag: 100 }] }
    const plan = skapaPlan(hast, analysKomplett, produkter)
    const valdes = plan.urval?.poster.some((p) => p.produkt.id === mineral.id)
    if (!valdes) {
      expect(
        plan.atgarder.some(
          (a) =>
            (a.code === 'action.swapSupplement' && a.params.from === displayName(mineral)) ||
            (a.code === 'action.stopSupplement' && a.params.product === displayName(mineral)),
        ),
      ).toBe(true)
    }
  })
})
