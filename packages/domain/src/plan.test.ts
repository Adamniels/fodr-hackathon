import { describe, expect, it } from 'vitest'
import { analysBas, analysHo, analysKomplett, demoHast, ponny } from '../test/fixtures/examples'
import produkterJson from '../test/fixtures/products.json'
import { beraknaBehov, smbRpFranRaprotein, viktFranBrostomfang } from './slu'
import { displayName, roundDose } from './intake'
import { planFor } from '../test/plan'
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
  const plan = planFor(demoHast, analysKomplett, produkter)

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
    const p = planFor(ponny, analysHo, produkter)
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
    const bas = planFor(demoHast, analysBas, produkter)
    expect(bas.saknadeAnalysvarden).toContain('se')
    expect(bas.resultat.find((r) => r.amne === 'se')!.kalla).toBe('schablon')
    expect(bas.urval).not.toBeNull()
  })
  it('ponny med EMS på hö ger en plan', () => {
    const p = planFor(ponny, analysHo, produkter)
    expect(p.urval).not.toBeNull()
    expect(p.resultat.filter((r) => r.status === 'over_max')).toEqual([])
  })
})

describe('foderplanens meddelanden (ADR 0014)', () => {
  const plan = planFor(demoHast, analysKomplett, produkter)

  it('nya tillskott som kod med produkt och gram', () => {
    const ge = plan.atgarder.filter((a) => a.code === 'action.giveSupplement')
    expect(ge.map((a) => a.params)).toEqual(
      plan.urval!.poster.map((p) => ({ product: displayName(p.produkt), grams: p.gramPerDag })),
    )
    expect(ge.every((a) => a.typ === 'tillskott')).toBe(true)
  })
  it('dagens tillskott som fortsätter, ändras eller tas bort', () => {
    const [forsta] = plan.urval!.poster
    const samma = planFor(
      { ...demoHast, nuvarandeFoder: [{ produktId: forsta.produkt.id, namn: '', gramPerDag: forsta.gramPerDag }] },
      analysKomplett,
      produkter,
    )
    expect(samma.atgarder).toContainEqual({
      typ: 'tillskott',
      code: 'action.continueSupplement',
      params: { product: displayName(forsta.produkt), grams: forsta.gramPerDag },
    })
    const annan = planFor(
      { ...demoHast, nuvarandeFoder: [{ produktId: forsta.produkt.id, namn: '', gramPerDag: forsta.gramPerDag + 7 }] },
      analysKomplett,
      produkter,
    )
    expect(annan.atgarder).toContainEqual({
      typ: 'tillskott',
      code: 'action.changeSupplement',
      params: { product: displayName(forsta.produkt), fromGrams: forsta.gramPerDag + 7, toGrams: forsta.gramPerDag },
    })
  })
  it('okänt foder och ofullständig deklaration som noteringar', () => {
    const delvis = produkter.find((p) => p.naringsdata === 'delvis')!
    const p = planFor(
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
    const p = planFor({ ...demoHast, halsa: { ...demoHast.halsa, magsar: true } }, utanSocker, produkter)
    expect(p.varningar).toContainEqual({ code: 'warning.sugarMissing', params: {} })
    expect(p.varningar).toContainEqual({ code: 'warning.ulcerPssmVet', params: {} })
  })
  it('grovfodret ändras med från, till och lägsta rekommenderade giva', () => {
    const mycket = planFor(
      { ...demoHast, grovfoder: { ...demoHast.grovfoder, kgPerDag: 30 } },
      analysKomplett,
      produkter,
    )
    const minska = mycket.atgarder.find((a) => a.code === 'action.reduceRoughage')
    expect(minska?.typ).toBe('andra_grovfoder')
    expect(minska?.code === 'action.reduceRoughage' && minska.params.fromKg).toBe(30)
    const lite = planFor({ ...demoHast, grovfoder: { ...demoHast.grovfoder, kgPerDag: 3 } }, analysKomplett, produkter)
    expect(lite.atgarder.map((a) => a.code)).toContain('action.increaseRoughage')
  })
})

const MINERAL = 'gg-1238586' // Brogaarden Vitamins & Minerals
const SALT = '800801-00-00000' // Salt 1,5 kg
const MAJS = 'gg-1237305' // 620 g stärkelse per kg, utan energivärde

describe('när inget tillskott går att lägga till (C3)', () => {
  it('auditens probe: 60 mg selen per kg ts säger att selen redan är över maxgränsen', () => {
    const plan = planFor(demoHast, { ...analysKomplett, perKgTs: { ...analysKomplett.perKgTs, se: 60 } }, produkter)
    expect(plan.urval).toBeNull()
    expect(plan.alternativ).toBeNull()
    // The roughage alone is over the maximum, so the analysis value is what to check.
    expect(plan.urvalshinder).toEqual({ code: 'infeasible.roughageOverMax', params: { nutrients: ['se'] } })
  })

  it('dagens tillskott står kvar oförändrade: inget "sluta med", ingen lägre kostnad, ingen injustering', () => {
    const medTillskott = {
      ...demoHast,
      nuvarandeFoder: [
        ...demoHast.nuvarandeFoder,
        { produktId: MINERAL, namn: '', gramPerDag: 100 },
        { produktId: SALT, namn: '', gramPerDag: 30 },
      ],
    }
    for (const analys of [
      { ...analysKomplett, perKgTs: { ...analysKomplett.perKgTs, se: 60 } },
      { ...analysKomplett, perKgTs: { ...analysKomplett.perKgTs, ca: 1, p: 8 } },
    ]) {
      const plan = planFor(medTillskott, analys, produkter)
      expect(plan.urvalshinder).not.toBeNull()
      expect(plan.atgarder.filter((a) => a.typ === 'tillskott' || a.code === 'action.stopSupplement')).toEqual([])
      expect(plan.behallnaFoder.map((p) => [p.produkt.id, p.gramPerDag])).toEqual(
        expect.arrayContaining([
          [MINERAL, 100],
          [SALT, 30],
        ]),
      )
      expect(plan.injustering.rader.some((r) => r.enhet === 'g' && (r.fran === 100 || r.fran === 30))).toBe(false)
    }
  })

  it('stärkelse över max från kraftfoder som behålls pekar på fodret, inte på analysen', () => {
    const majs = { ...demoHast, nuvarandeFoder: [{ produktId: MAJS, namn: '', gramPerDag: 6000 }] }
    const plan = planFor(majs, analysKomplett, produkter)
    expect(plan.urvalshinder).toEqual({ code: 'infeasible.overMax', params: { nutrients: ['starkelse'] } })
  })

  it('ingen kombination når Ca:P 1,1: hindret säger det, utan ämne över max', () => {
    // Without products only the empty combination exists, and this roughage has Ca:P 0,5.
    const fosforrik = { ...analysKomplett, perKgTs: { ...analysKomplett.perKgTs, ca: 2, p: 4 } }
    const plan = planFor(demoHast, fosforrik, [])
    expect(plan.urval).toBeNull()
    expect(plan.urvalshinder).toEqual({ code: 'infeasible.caP', params: { minRatio: 1.1 } })
  })

  it('ett urval utan produkter är inget hinder', () => {
    const plan = planFor(demoHast, analysKomplett, [])
    expect(plan.urvalshinder).toBeNull()
    expect(plan.urval?.poster).toEqual([])
  })

  it('demofallet har ett urval och inget hinder', () => {
    const plan = planFor(demoHast, analysKomplett, produkter)
    expect(plan.urvalshinder).toBeNull()
    expect(plan.urval).not.toBeNull()
  })
})

describe('en regel för lite socker: fång, EMS, PPID och korsförlamning (C5)', () => {
  const frisk = { fang: false, ems: false, ovrigt: '' }
  const villkor = [
    ['fång', { fang: true }],
    ['EMS', { ems: true }],
    ['PPID', { ppid: true }],
    ['korsförlamning', { pssm: true }],
  ] as const
  const sockerrik = { ...analysKomplett, perKgTs: { ...analysKomplett.perKgTs, socker: 150 } }
  const utanSocker = { ...analysKomplett, perKgTs: { ...analysKomplett.perKgTs, socker: undefined } }
  const koder = (p: ReturnType<typeof planFor>) => p.varningar.map((v) => v.code)

  it.each(villkor)('%s: varnar för högt och saknat socker, utan den allmänna kvalitetsflaggan', (_, halsa) => {
    const hast = { ...demoHast, halsa: { ...frisk, ...halsa } }
    const hog = planFor(hast, sockerrik, produkter)
    expect(hog.varningar).toContainEqual({ code: 'warning.sugarHigh', params: { sugarG: 150, limitG: 100 } })
    expect(hog.grovfoderkvalitet.map((f) => f.text.code)).not.toContain('quality.sugarHigh')
    expect(koder(planFor(hast, utanSocker, produkter))).toContain('warning.sugarMissing')
  })

  it('en frisk häst får kvalitetsflaggan i stället för varningarna', () => {
    const hast = { ...demoHast, halsa: frisk }
    const plan = planFor(hast, sockerrik, produkter)
    expect(koder(plan)).not.toContain('warning.sugarHigh')
    expect(plan.grovfoderkvalitet.map((f) => f.text.code)).toContain('quality.sugarHigh')
    expect(koder(planFor(hast, utanSocker, produkter))).not.toContain('warning.sugarMissing')
  })

  it('veterinärvarningen för ämnesomsättning gäller fång, EMS och PPID, inte korsförlamning ensam', () => {
    for (const [namn, halsa] of villkor) {
      const plan = planFor({ ...demoHast, halsa: { ...frisk, ...halsa } }, analysKomplett, produkter)
      expect([namn, koder(plan).includes('warning.metabolicVet')]).toEqual([namn, namn !== 'korsförlamning'])
    }
  })
})

describe('doser jämförs som de visas: hela gram (#103)', () => {
  const urvalsdos = planFor(demoHast, analysKomplett, produkter).urval!.poster[0]
  const medDos = (gramPerDag: number) =>
    planFor(
      { ...demoHast, nuvarandeFoder: [{ produktId: urvalsdos.produkt.id, namn: '', gramPerDag }] },
      analysKomplett,
      produkter,
    )
  const tillskott = (p: ReturnType<typeof planFor>) =>
    p.atgarder.filter((a) => a.typ === 'tillskott' || a.code === 'action.stopSupplement')

  it('en dos som avrundas till planens dos fortsätter, i stället för "ändra från 12 till 12"', () => {
    for (const skillnad of [0.4, -0.4]) {
      expect(tillskott(medDos(urvalsdos.gramPerDag + skillnad))).toContainEqual({
        typ: 'tillskott',
        code: 'action.continueSupplement',
        params: { product: displayName(urvalsdos.produkt), grams: urvalsdos.gramPerDag },
      })
    }
  })

  it('en synligt annan dos ändras som förut', () => {
    expect(tillskott(medDos(urvalsdos.gramPerDag + 0.6)).map((a) => a.code)).toContain('action.changeSupplement')
  })

  it('ett foder på 0 g ges inte: ingen åtgärd och ingen kostnad', () => {
    const valda = new Set(planFor(demoHast, analysKomplett, produkter).urval!.poster.map((p) => p.produkt.id))
    const mineral = produkter.find((p) => p.kategori === 'mineralfoder' && !valda.has(p.id))!
    const kraftfoder = produkter.find(
      (p) => p.kategori === 'kraftfoder' && p.id !== demoHast.nuvarandeFoder[0].produktId,
    )!
    const plan = planFor(
      {
        ...demoHast,
        nuvarandeFoder: [
          ...demoHast.nuvarandeFoder,
          { produktId: mineral.id, namn: '', gramPerDag: 0 },
          { produktId: kraftfoder.id, namn: '', gramPerDag: 0 },
        ],
      },
      analysKomplett,
      produkter,
    )
    const namn = [displayName(mineral), displayName(kraftfoder)]
    const omNoll = plan.atgarder.filter((a) =>
      Object.values(a.params).some((v) => typeof v === 'string' && namn.includes(v)),
    )
    expect(omNoll).toEqual([])
    expect(plan.behallnaFoder.map((p) => p.produkt.id)).not.toContain(kraftfoder.id)
    // Today's cost and the notes are as without the feeds.
    const utan = planFor(demoHast, analysKomplett, produkter)
    expect(plan.nulageKostnadPerManad).toBe(utan.nulageKostnadPerManad)
    expect(plan.noteringar).toEqual(utan.noteringar)
  })

  it('en dos som visas som 0 ges inte heller', () => {
    const valda = new Set(planFor(demoHast, analysKomplett, produkter).urval!.poster.map((p) => p.produkt.id))
    const mineral = produkter.find((p) => p.kategori === 'mineralfoder' && !valda.has(p.id))!
    const plan = planFor(
      {
        ...demoHast,
        nuvarandeFoder: [...demoHast.nuvarandeFoder, { produktId: mineral.id, namn: '', gramPerDag: 0.04 }],
      },
      analysKomplett,
      produkter,
    )
    const omMineral = plan.atgarder.filter((a) => Object.values(a.params).includes(displayName(mineral)))
    expect(omMineral).toEqual([])
  })

  it('doser avrundas som de visas: hela gram, en decimal under 1 g', () => {
    expect([0.04, 0.05, 0.3, 0.6, 0.96, 1, 12.4, 12.5, 1000.4].map(roundDose)).toEqual([
      0, 0.1, 0.3, 0.6, 1, 1, 12, 13, 1000,
    ])
  })
})
