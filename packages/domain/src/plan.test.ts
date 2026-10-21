import { describe, expect, it } from 'vitest'
import { analysBas, analysHo, analysKomplett, demoHast, ponny } from '../test/fixtures/examples'
import produkterJson from '../test/fixtures/products.json'
import { beraknaBehov, smbRpFranRaprotein, viktFranBrostomfang } from './slu'
import { visningsnamn } from './intake'
import { skapaPlan } from './plan'
import type { Produkt } from './types'

const produkter = produkterJson as Produkt[]

describe('SLU-behov, handräknat demofall', () => {
  // Handräkning (SLU Rapport 289):
  // Vikt vid normalt hull: 550 × (1 − 0,04 × 2) = 506 kg
  // Underhåll: 0,5 × 506^0,75 × 1,05 = 56,0 MJ (tabell 3 ger 56 för 500 kg normalfödd)
  // Arbete, tabell 11, aktuell vikt 550 kg, 4 pass à 60 min varav 15 trav/galopp:
  //   skritt 45 × 4/7 = 25,7 min → 0,2 × 2,57 × 5,5 = 2,83 MJ
  //   trav   15 × 4/7 =  8,6 min → 1,3 × 0,857 × 5,5 = 6,13 MJ
  // Totalt 65,0 MJ, protein 6 × 65,0 = 390 g smb rp. Arbete 16 % → mineralrad "<30 %".
  const r = beraknaBehov(demoHast)

  it('räknar på vikt vid normalt hull', () => {
    expect(r.berakningsviktKg).toBeCloseTo(506, 0)
  })
  it('energi och protein', () => {
    expect(r.underhallMJ).toBeCloseTo(56.0, 0)
    expect(r.arbetsMJ).toBeCloseTo(8.96, 1)
    expect(r.behov.energi!.min).toBeCloseTo(65.0, 0)
    expect(r.behov.smbRp!.min).toBeCloseTo(390, -1)
  })
  it('mineraler enligt tabell 15 och 17', () => {
    expect(r.behov.ca!.min).toBeCloseTo(6.0 * 5.06, 1)
    expect(r.behov.p!.min).toBeCloseTo(3.6 * 5.06, 1)
    expect(r.behov.na!.min).toBeCloseTo(7 * 0.393 * 5.06, 1)
    expect(r.behov.se!.min).toBeCloseTo(0.2 * 5.06, 2)
    expect(r.behov.se!.max).toBeCloseTo(5 * 5.06, 1)
  })
  it('matchar SLU:s räkneexempel a) på sid 13', () => {
    // 500 kg, 1 h 5 dagar/vecka, 15 min trav/galopp per pass. SLU avrundar till 30 min skritt och
    // 10 min trav (9,5 MJ tillägg, 65,5 MJ totalt). Exakt: 32,1 och 10,7 min ger 10,2 MJ, och
    // formeln ger underhåll 55,5 MJ där tabell 3 avrundar till 56. Totalt 65,7 MJ.
    const ex = beraknaBehov({
      ...demoHast,
      viktKg: 500,
      hull: 5,
      ridning: { passPerVecka: 5, minuterPerPass: 60, travGaloppMinPerPass: 15 },
    })
    expect(ex.arbetsMJ).toBeCloseTo(10.17, 1)
    expect(ex.behov.energi!.min).toBeCloseTo(65.7, 0)
  })
})

describe('hjälpformler', () => {
  it('smb rp från råprotein (sid 25)', () => {
    expect(smbRpFranRaprotein(140)).toBeCloseTo(100.2, 0)
  })
  it('vikt från bröstomfång och längd (sid 35)', () => {
    expect(viktFranBrostomfang(190, 160)).toBeCloseTo(649, 0)
  })
})

describe('foderplan', () => {
  const plan = skapaPlan(demoHast, analysKomplett, produkter)

  it('tar bort pelletsen eftersom grovfodret täcker energin', () => {
    expect(plan.atgarder).toContainEqual({
      typ: 'ta_bort',
      code: 'action.removeConcentrate',
      params: { product: 'Krafft Leisure Pellets 20kg', grams: 1000 },
    })
    expect(plan.behallnaFoder).toHaveLength(0)
  })
  it('täcker alla bedömbara brister utan att överskrida maxgränser', () => {
    expect(plan.urval).not.toBeNull()
    expect(plan.urval!.kvarvarandeBrister).toEqual([])
    expect(plan.resultat.filter((r) => r.status === 'over_max')).toEqual([])
    expect(plan.caP!).toBeGreaterThanOrEqual(1.1)
  })
  it('väljer bara produkter som passar en fånghäst', () => {
    expect(plan.urval!.poster.every((p) => p.produkt.lampligVidFangEms)).toBe(true)
  })
  it('hänvisar till veterinär vid fånghistorik', () => {
    expect(plan.varningar).toContainEqual({ code: 'warning.metabolicVet', params: {} })
  })
  it('varnar för socker i hö över 100 g/kg ts vid EMS (A07, 122 g)', () => {
    const p = skapaPlan(ponny, analysHo, produkter)
    expect(p.varningar).toContainEqual({ code: 'warning.sugarHigh', params: { sugarG: 122, limitG: 100 } })
  })
  it('föreslår aldrig två mineralfoder samtidigt', () => {
    expect(plan.urval!.poster.filter((p) => p.produkt.kategori === 'mineralfoder').length).toBeLessThanOrEqual(1)
  })
  it('blir billigare än nuläget och räknar kväveöverskott', () => {
    expect(plan.urval!.kostnadPerManad).toBeLessThan(plan.nulageKostnadPerManad)
    // (660 − 390) g smb rp/dag / 6,25 × 365 / 1000 ≈ 15,8 kg N/år
    expect(plan.kvaveOverskottKgPerAr).toBeCloseTo(15.8, 0)
  })
  it('basanalys: saknade mineraler fylls med schablon och redovisas', () => {
    const bas = skapaPlan(demoHast, analysBas, produkter)
    expect(bas.saknadeAnalysvarden).toContain('se')
    expect(bas.resultat.find((r) => r.amne === 'se')!.kalla).toBe('schablon')
    expect(bas.urval).not.toBeNull()
  })
  it('ponny med EMS på hö ger en plan', () => {
    const p = skapaPlan(ponny, analysHo, produkter)
    expect(p.urval).not.toBeNull()
    expect(p.resultat.filter((r) => r.status === 'over_max')).toEqual([])
  })
})

describe('foderplanens meddelanden (ADR 0014)', () => {
  const plan = skapaPlan(demoHast, analysKomplett, produkter)

  it('nya tillskott som kod med produkt och gram', () => {
    const ge = plan.atgarder.filter((a) => a.code === 'action.giveSupplement')
    expect(ge.map((a) => a.params)).toEqual(
      plan.urval!.poster.map((p) => ({ product: visningsnamn(p.produkt), grams: p.gramPerDag })),
    )
    expect(ge.every((a) => a.typ === 'tillskott')).toBe(true)
  })
  it('dagens tillskott som fortsätter, ändras eller tas bort', () => {
    const [forsta] = plan.urval!.poster
    const samma = skapaPlan(
      { ...demoHast, nuvarandeFoder: [{ produktId: forsta.produkt.id, namn: '', gramPerDag: forsta.gramPerDag }] },
      analysKomplett,
      produkter,
    )
    expect(samma.atgarder).toContainEqual({
      typ: 'tillskott',
      code: 'action.continueSupplement',
      params: { product: visningsnamn(forsta.produkt), grams: forsta.gramPerDag },
    })
    const annan = skapaPlan(
      { ...demoHast, nuvarandeFoder: [{ produktId: forsta.produkt.id, namn: '', gramPerDag: forsta.gramPerDag + 7 }] },
      analysKomplett,
      produkter,
    )
    expect(annan.atgarder).toContainEqual({
      typ: 'tillskott',
      code: 'action.changeSupplement',
      params: { product: visningsnamn(forsta.produkt), fromGrams: forsta.gramPerDag + 7, toGrams: forsta.gramPerDag },
    })
  })
  it('okänt foder och ofullständig deklaration som noteringar', () => {
    const delvis = produkter.find((p) => p.naringsdata === 'delvis')!
    const p = skapaPlan(
      {
        ...demoHast,
        nuvarandeFoder: [
          { produktId: null, namn: 'Hemblandning', gramPerDag: 200 },
          { produktId: delvis.id, namn: delvis.namn, gramPerDag: 50 },
        ],
      },
      analysKomplett,
      produkter,
    )
    expect(p.noteringar).toContainEqual({ code: 'note.unknownFeed', params: { name: 'Hemblandning' } })
    expect(p.noteringar).toContainEqual({ code: 'note.incompleteDeclaration', params: { product: delvis.namn } })
  })
  it('saknat socker vid fång och veterinär vid magsår som varningar', () => {
    const utanSocker = { ...analysKomplett, perKgTs: { ...analysKomplett.perKgTs, socker: undefined } }
    const p = skapaPlan({ ...demoHast, halsa: { ...demoHast.halsa, magsar: true } }, utanSocker, produkter)
    expect(p.varningar).toContainEqual({ code: 'warning.sugarMissing', params: {} })
    expect(p.varningar).toContainEqual({ code: 'warning.ulcerPssmVet', params: {} })
  })
  it('grovfodret ändras med från, till och lägsta rekommenderade giva', () => {
    const mycket = skapaPlan(
      { ...demoHast, grovfoder: { ...demoHast.grovfoder, kgPerDag: 30 } },
      analysKomplett,
      produkter,
    )
    const minska = mycket.atgarder.find((a) => a.code === 'action.reduceRoughage')
    expect(minska?.typ).toBe('andra_grovfoder')
    expect(minska?.code === 'action.reduceRoughage' && minska.params.fromKg).toBe(30)
    const lite = skapaPlan(
      { ...demoHast, grovfoder: { ...demoHast.grovfoder, kgPerDag: 3 } },
      analysKomplett,
      produkter,
    )
    expect(lite.atgarder.map((a) => a.code)).toContain('action.increaseRoughage')
  })
})
