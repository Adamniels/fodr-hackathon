import { NUTRIENT_KEYS, type NutrientKey } from './nutrients'
import { beraknaBehov, type Behov, type Behovsresultat } from './slu'
import { grovfoderIntag, monthlyCost, laggTill, displayName, roundDose, type Foderpost, type Intag } from './intake'
import { styrandeAmnen, valjProdukter, type Urval } from './optimize'
import { bedomGrovfoder, type Kvalitetsflagga } from './quality'
import {
  SOCKER_GRANS_G_PER_KG_TS,
  filtreraProdukter,
  granskaKansligheter,
  kraverLagSockerStarkelse,
  type Kanslighetsrad,
} from './sensitivity'
import { hittaBilligareLiknande, type Byte } from './swaps'
import { skapaInjustering, type Injustering } from './transition'
import type {
  ActionMessage,
  Kallhanvisning,
  Notering,
  Urvalshinder,
  UrvalsSkal,
  Uteslutningsskal,
  Varning,
} from './messages'
import type { Grovfoderanalys, Hastprofil, Kalla, Produkt } from './types'
import { validateAnalysis, validateProfile, type InputError } from './validation'

/** 'osaker': uppskattat värde under behovet för ett ämne som inte styr urvalet. */
export type Status = 'brist' | 'ok' | 'overskott' | 'over_max' | 'okand' | 'osaker' | 'ej_krav'

export interface Balansrad {
  amne: NutrientKey
  behovMin?: number
  behovMax?: number
  intag: number
  kalla: Kalla
  schablonKalla?: string
  behovKalla?: Kallhanvisning
  status: Status
}

export type AtgardTyp = 'ta_bort' | 'byt' | 'andra_grovfoder' | 'lagg_till_kraftfoder' | 'protein' | 'tillskott'

/** The kind of each action, which the UI shows. */
interface ActionTypeByCode {
  'action.removeConcentrate': 'ta_bort'
  'action.swapCheaper': 'byt'
  'action.reduceRoughage': 'andra_grovfoder'
  'action.increaseRoughage': 'andra_grovfoder'
  'action.roughageLacksEnergy': 'lagg_till_kraftfoder'
  'action.proteinShort': 'protein'
  'action.continueSupplement': 'tillskott'
  'action.changeSupplement': 'tillskott'
  'action.swapSupplement': 'byt'
  'action.stopSupplement': 'ta_bort'
  'action.giveSupplement': 'tillskott'
}

type ActionCode = ActionMessage['code']

/** An action in the plan: what to change, as a message, with the kind that belongs to its code. */
export type Atgard = {
  [C in ActionCode]: Extract<ActionMessage, { code: C }> & { typ: ActionTypeByCode[C] }
}[ActionCode]

interface Plandelar {
  behov: Behovsresultat
  nulage: Balansrad[]
  nulageKostnadPerManad: number
  atgarder: Atgard[]
  grovfoderKgPerDag: number
  behallnaFoder: Foderpost[]
  resultat: Balansrad[]
  caP: number | null
  /** Ungefärligt kväveöverskott, kg N per år, från smältbart protein över behovet. */
  kvaveOverskottKgPerAr: number
  varningar: Varning[]
  noteringar: Notering[]
  saknadeAnalysvarden: NutrientKey[]
  /** Bedömning av grovfodret i sig (SLU tabell 32, ts, jordinblandning). */
  grovfoderkvalitet: Kvalitetsflagga[]
  /** Råd och varningar utifrån hästens känsligheter. */
  kansligheter: Kanslighetsrad[]
  /** Urvalsprodukter som valdes bort på grund av känsligheter, med skäl. */
  bortvalda: { namn: string; skal: Uteslutningsskal[] }[]
  /** Dagens foder som byts mot en liknande eller bättre passande produkt, med kostnad före och efter. */
  byten: Byte[]
  /** Hur dagens foder trappas över till planen, i takt med hästens känslighet för foderbyten. */
  injustering: Injustering
}

/**
 * A plan has either a selection of supplements or the reason none can be added (C3, ADR 0013), never neither: a
 * screen cannot show a missing selection as "no supplements needed" without handling the hinder.
 */
export type Plan = Plandelar &
  (
    | { urval: Urval; alternativ: Urval | null; urvalshinder: null }
    | { urval: null; alternativ: null; urvalshinder: Urvalshinder }
  )

const ENERGI_OVER = 1.1
const ENERGI_UNDER = 0.95

export function balans(intag: Intag, behov: Behov, styrande?: NutrientKey[]): Balansrad[] {
  return NUTRIENT_KEYS.map((k) => {
    const krav = behov[k]
    const v = intag[k]
    const rad: Balansrad = {
      amne: k,
      behovMin: krav?.min,
      behovMax: krav?.max,
      intag: v.varde,
      kalla: v.kalla,
      schablonKalla: v.schablonKalla,
      behovKalla: krav?.kalla,
      status: 'ok',
    }
    if (!krav) rad.status = 'ej_krav'
    else if (v.kalla === 'okand') rad.status = 'okand'
    else if (krav.max !== undefined && v.varde > krav.max) rad.status = 'over_max'
    else if (krav.min !== undefined && k === 'energi') {
      const kvot = v.varde / krav.min
      rad.status = kvot < ENERGI_UNDER ? 'brist' : kvot > ENERGI_OVER ? 'overskott' : 'ok'
    } else if (krav.min !== undefined && v.varde < krav.min) {
      const bedoms = !styrande || styrande.includes(k) || k === 'smbRp'
      rad.status = bedoms ? 'brist' : 'osaker'
    }
    return rad
  })
}

function hittaProdukt(produkter: Produkt[], id: string | null): Produkt | undefined {
  return id ? produkter.find((p) => p.id === id) : undefined
}

/** A plan, or the fields that must be corrected before one can be calculated (C1, #13). */
export type PlanResult = { plan: Plan } | { errors: InputError[] }

export function skapaPlan(profil: Hastprofil, analys: Grovfoderanalys, produkter: Produkt[]): PlanResult {
  const errors = [...validateProfile(profil), ...validateAnalysis(analys)]
  return errors.length ? { errors } : { plan: byggPlan(profil, analys, produkter) }
}

function byggPlan(profil: Hastprofil, analys: Grovfoderanalys, produkter: Produkt[]): Plan {
  const behovsres = beraknaBehov(profil)
  const { behov, grovfoderKgTs } = behovsres
  const varningar: Varning[] = []
  const noteringar: Notering[] = [...behovsres.noteringar]
  const atgarder: Atgard[] = []
  const ts = analys.tsProcent / 100
  const energiBehov = behov.energi.min

  // Nuläge: grovfoder plus allt hästen får i dag.
  const nuvarande: Foderpost[] = []
  for (const f of profil.nuvarandeFoder) {
    // A feed whose dose rounds to 0 g is not given: it gets no action and no cost line (#103).
    if (roundDose(f.gramPerDag) === 0) continue
    const produkt = hittaProdukt(produkter, f.produktId)
    if (produkt) {
      nuvarande.push({ produkt, gramPerDag: f.gramPerDag })
      if (produkt.naringsdata !== 'komplett') {
        noteringar.push({ code: 'note.incompleteDeclaration', params: { product: produkt.namn } })
      }
    } else noteringar.push({ code: 'note.unknownFeed', params: { name: f.namn } })
  }
  const nulageIntag = laggTill(grovfoderIntag(analys, profil.grovfoder.kgPerDag), nuvarande)
  const nulageKostnad = nuvarande.reduce((s, p) => s + monthlyCost(p.produkt, p.gramPerDag), 0)

  // Mineralfoder, tillskott och salt väljs om av urvalet. Allt annat behålls tills vidare.
  const ERSATTS = ['mineralfoder', 'tillskott', 'salt']
  let behallna = nuvarande.filter((p) => !ERSATTS.includes(p.produkt.kategori))
  let grovKg = profil.grovfoder.kgPerDag
  const energiVidKg = (kg: number, foder: Foderpost[]) => laggTill(grovfoderIntag(analys, kg), foder).energi.varde

  // SLU: vid överhull minskas i första hand kraftfodret.
  if (energiVidKg(grovKg, behallna) > energiBehov * ENERGI_OVER) {
    for (const k of [...behallna].filter((p) => p.produkt.kategori === 'kraftfoder')) {
      behallna = behallna.filter((p) => p !== k)
      atgarder.push({
        typ: 'ta_bort',
        code: 'action.removeConcentrate',
        params: { product: displayName(k.produkt), grams: k.gramPerDag },
      })
      if (energiVidKg(grovKg, behallna) <= energiBehov * ENERGI_OVER) break
    }
  }

  // Dagens kraft- och proteinfoder jämförs med liknande produkter. Finns ett billigare foder med
  // samma energi och protein byts det, med en giva som ger lika mycket energi.
  const byten: Byte[] = []
  behallna = behallna.map((p) => {
    const b = hittaBilligareLiknande(p, produkter, profil.halsa)
    if (!b) return p
    byten.push(b)
    atgarder.push({
      typ: 'byt',
      code: 'action.swapCheaper',
      params: {
        from: displayName(p.produkt),
        fromGrams: p.gramPerDag,
        to: displayName(b.till.produkt),
        toGrams: b.till.gramPerDag,
        reason: b.skal,
        savingKr: b.besparingKrPerManad,
      },
    })
    return b.till
  })
  // Två foder kan bytas mot samma produkt; då blir det en rad med den sammanlagda givan.
  behallna = behallna.reduce<Foderpost[]>((ut, p) => {
    const finns = ut.find((x) => x.produkt.id === p.produkt.id)
    if (finns) finns.gramPerDag += p.gramPerDag
    else ut.push({ ...p })
    return ut
  }, [])

  // SLU: i andra hand minskas grovfodret, dock aldrig under 1 kg ts per 100 kg.
  const energiPerKgFoder = (analys.perKgTs.energi ?? 0) * ts
  if (energiPerKgFoder > 0 && energiVidKg(grovKg, behallna) > energiBehov * ENERGI_OVER) {
    const ovrigEnergi = energiVidKg(0, behallna)
    const kgSomTackerEnergi = (energiBehov - ovrigEnergi) / energiPerKgFoder
    const nyKg = Math.max(kgSomTackerEnergi, grovfoderKgTs.minimum / ts)
    if (grovKg - nyKg > 0.3) {
      atgarder.push({
        typ: 'andra_grovfoder',
        code: 'action.reduceRoughage',
        params: { fromKg: grovKg, toKg: nyKg, minimumKg: grovfoderKgTs.minimum / ts },
      })
      grovKg = nyKg
    }
  }

  // SLU: vid underhull ökas i första hand vallfodergivan.
  if (energiPerKgFoder > 0 && energiVidKg(grovKg, behallna) < energiBehov * ENERGI_UNDER) {
    const ovrigEnergi = energiVidKg(0, behallna)
    const kgSomTackerEnergi = (energiBehov - ovrigEnergi) / energiPerKgFoder
    const maxKg = grovfoderKgTs.rekommenderatMax / ts
    const nyKg = Math.min(kgSomTackerEnergi, maxKg)
    if (nyKg - grovKg > 0.3) {
      atgarder.push({ typ: 'andra_grovfoder', code: 'action.increaseRoughage', params: { fromKg: grovKg, toKg: nyKg } })
      grovKg = nyKg
    }
    if (energiVidKg(grovKg, behallna) < energiBehov * ENERGI_UNDER) {
      atgarder.push({ typ: 'lagg_till_kraftfoder', code: 'action.roughageLacksEnergy', params: {} })
    }
  }

  const grovKgTs = grovKg * ts
  if (grovKgTs < grovfoderKgTs.minimum) {
    varningar.push({
      code: 'warning.roughageBelowMinimum',
      params: { kgDm: grovKgTs, minimumKgDm: grovfoderKgTs.minimum },
    })
  }

  const bas = laggTill(grovfoderIntag(analys, grovKg), behallna)
  if (bas.smbRp.varde < behov.smbRp.min) {
    atgarder.push({ typ: 'protein', code: 'action.proteinShort', params: {} })
  }

  const h = profil.halsa
  if (h.fang || h.ems || h.ppid) {
    varningar.push({ code: 'warning.metabolicVet', params: {} })
  }
  // One rule for low sugar decides the warnings, the product exclusion and the quality flag (C5).
  if (kraverLagSockerStarkelse(h)) {
    const socker = analys.perKgTs.socker
    if (socker === undefined) {
      varningar.push({ code: 'warning.sugarMissing', params: {} })
    } else if (socker > SOCKER_GRANS_G_PER_KG_TS) {
      varningar.push({ code: 'warning.sugarHigh', params: { sugarG: socker, limitG: SOCKER_GRANS_G_PER_KG_TS } })
    }
  }

  if (h.magsar || h.pssm) {
    varningar.push({ code: 'warning.ulcerPssmVet', params: {} })
  }

  const { tillatna, uteslutna } = filtreraProdukter(produkter, h)
  const utfall = valjProdukter({
    bas,
    grovfoder: grovfoderIntag(analys, grovKg),
    behov,
    produkter: tillatna,
    berakningsviktKg: behovsres.berakningsviktKg,
  })
  // Dagens mineralfoder, tillskott och salt ställs mot urvalet så att det syns vad som byts,
  // vad som tas bort och vad som är nytt, i stället för att gamla produkter bara försvinner.
  const { urval } = utfall
  const nyaPoster = urval?.poster ?? []
  const ersatta = nuvarande.filter((p) => ERSATTS.includes(p.produkt.kategori))
  // When nothing can be added, today's mineral feed, supplements and salt stay as they are: stopping them could make
  // the plan worse (a calcium source when Ca:P is short, salt when sodium is), and the plan must not look cheaper (C3).
  if (!urval) behallna = [...behallna, ...ersatta]
  const hanterade = new Set<string>()
  for (const gammal of urval ? ersatta : []) {
    const kvar = nyaPoster.find((n) => n.produkt.id === gammal.produkt.id)
    if (kvar) {
      hanterade.add(kvar.produkt.id)
      atgarder.push(
        // Compared as shown: 12,4 g against the plan's 12 g continues, 0,6 g against 1 g changes (#103).
        roundDose(kvar.gramPerDag) === roundDose(gammal.gramPerDag)
          ? {
              typ: 'tillskott',
              code: 'action.continueSupplement',
              params: { product: displayName(kvar.produkt), grams: kvar.gramPerDag },
            }
          : {
              typ: 'tillskott',
              code: 'action.changeSupplement',
              params: { product: displayName(kvar.produkt), fromGrams: gammal.gramPerDag, toGrams: kvar.gramPerDag },
            },
      )
      continue
    }
    const ersattare = nyaPoster.find(
      (n) =>
        // Ett tillskott paras inte ihop med ett annat, de innehåller ofta helt olika saker.
        n.produkt.kategori === gammal.produkt.kategori &&
        gammal.produkt.kategori !== 'tillskott' &&
        !hanterade.has(n.produkt.id) &&
        !ersatta.some((e) => e.produkt.id === n.produkt.id),
    )
    const fore = monthlyCost(gammal.produkt, gammal.gramPerDag)
    if (ersattare) {
      hanterade.add(ersattare.produkt.id)
      const efter = monthlyCost(ersattare.produkt, ersattare.gramPerDag)
      const skal: UrvalsSkal =
        efter < fore - 1
          ? { code: 'swapReason.coversNeedCheaper', params: { savingKr: fore - efter } }
          : { code: 'swapReason.coversBetter', params: {} }
      byten.push({
        fran: gammal,
        till: ersattare,
        kostnadFore: fore,
        kostnadEfter: efter,
        besparingKrPerManad: fore - efter,
        skal,
      })
      atgarder.push({
        typ: 'byt',
        code: 'action.swapSupplement',
        params: {
          from: displayName(gammal.produkt),
          fromGrams: gammal.gramPerDag,
          to: displayName(ersattare.produkt),
          toGrams: ersattare.gramPerDag,
          reason: skal,
        },
      })
    } else {
      atgarder.push({
        typ: 'ta_bort',
        code: 'action.stopSupplement',
        params: { product: displayName(gammal.produkt), grams: gammal.gramPerDag, costKr: fore },
      })
    }
  }
  for (const p of nyaPoster) {
    if (hanterade.has(p.produkt.id)) continue
    atgarder.push({
      typ: 'tillskott',
      code: 'action.giveSupplement',
      params: { product: displayName(p.produkt), grams: p.gramPerDag },
    })
  }

  const slutIntag = urval?.intag ?? laggTill(bas, ersatta)
  const styrande = styrandeAmnen(bas, behov)
  const resultat = balans(slutIntag, behov, styrande)
  const proteinOver = Math.max(0, slutIntag.smbRp.varde - behov.smbRp.min)
  // Kväve = protein / 6,25. Gram per dag till kg per år.
  const kvave = ((proteinOver / 6.25) * 365) / 1000

  return {
    behov: behovsres,
    nulage: balans(nulageIntag, behov, styrande),
    nulageKostnadPerManad: nulageKostnad,
    atgarder,
    grovfoderKgPerDag: grovKg,
    behallnaFoder: behallna,
    ...(utfall.urval
      ? { urval: utfall.urval, alternativ: utfall.alternativ, urvalshinder: null }
      : { urval: null, alternativ: null, urvalshinder: utfall.hinder }),
    resultat,
    caP: slutIntag.p.varde > 0 ? slutIntag.ca.varde / slutIntag.p.varde : null,
    kvaveOverskottKgPerAr: kvave,
    varningar,
    noteringar,
    saknadeAnalysvarden: NUTRIENT_KEYS.filter((k) => analys.perKgTs[k] === undefined && behov[k]?.min !== undefined),
    grovfoderkvalitet: bedomGrovfoder(analys, profil),
    kansligheter: granskaKansligheter(
      h,
      nuvarande,
      { intag: slutIntag.smbRp.varde, behov: behov.smbRp.min },
      behovsres.berakningsviktKg,
    ),
    bortvalda: uteslutna.filter((u) => u.produkt.iUrval).map((u) => ({ namn: u.produkt.namn, skal: u.skal })),
    byten,
    injustering: skapaInjustering({
      halsa: h,
      kanslighet: profil.bytekanslighet,
      grovfodertyp: analys.typ,
      grovfoderFranKg: profil.grovfoder.kgPerDag,
      grovfoderTillKg: grovKg,
      fran: nuvarande,
      till: [...behallna, ...nyaPoster],
    }),
  }
}
