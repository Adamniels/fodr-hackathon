import { NUTRIENT_KEYS, type NutrientKey } from './nutrients'
import { beraknaBehov, type Behov, type Behovsresultat } from './slu'
import { grovfoderIntag, kostnadPerManad, laggTill, visningsnamn as namn, type Foderpost, type Intag } from './intake'
import { styrandeAmnen, valjProdukter, type Urval } from './optimize'
import { bedomGrovfoder, type Kvalitetsflagga } from './kvalitet'
import { filtreraProdukter, granskaKansligheter, type Kanslighetsrad } from './kanslighet'
import { hittaBilligareLiknande, type Byte } from './byten'
import type { Grovfoderanalys, Hastprofil, Kalla, Produkt } from './types'

/** 'osaker': uppskattat värde under behovet för ett ämne som inte styr urvalet. */
export type Status = 'brist' | 'ok' | 'overskott' | 'over_max' | 'okand' | 'osaker' | 'ej_krav'

export interface Balansrad {
  amne: NutrientKey
  behovMin?: number
  behovMax?: number
  intag: number
  kalla: Kalla
  schablonKalla?: string
  behovKalla?: string
  status: Status
}

export type AtgardTyp = 'ta_bort' | 'byt' | 'andra_grovfoder' | 'lagg_till_kraftfoder' | 'protein' | 'tillskott'

export interface Atgard {
  typ: AtgardTyp
  text: string
}

export interface Plan {
  behov: Behovsresultat
  nulage: Balansrad[]
  nulageKostnadPerManad: number
  atgarder: Atgard[]
  grovfoderKgPerDag: number
  behallnaFoder: Foderpost[]
  urval: Urval | null
  alternativ: Urval | null
  resultat: Balansrad[]
  caP: number | null
  /** Ungefärligt kväveöverskott, kg N per år, från smältbart protein över behovet. */
  kvaveOverskottKgPerAr: number
  varningar: string[]
  noteringar: string[]
  saknadeAnalysvarden: NutrientKey[]
  /** Bedömning av grovfodret i sig (SLU tabell 32, ts, jordinblandning). */
  grovfoderkvalitet: Kvalitetsflagga[]
  /** Råd och varningar utifrån hästens känsligheter. */
  kansligheter: Kanslighetsrad[]
  /** Urvalsprodukter som valdes bort på grund av känsligheter, med skäl. */
  bortvalda: { namn: string; skal: string[] }[]
  /** Dagens foder som byts mot en liknande eller bättre passande produkt, med kostnad före och efter. */
  byten: Byte[]
}

const ENERGI_OVER = 1.1
const ENERGI_UNDER = 0.95
// ANTAGANDE: vanlig rekommendation för hästar med fång eller EMS är grovfoder med under ca 10 %
// socker (100 g/kg ts). SLU Rapport 289 anger ingen sockergräns.
const SOCKER_GRANS_G_PER_KG_TS = 100

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

export function skapaPlan(profil: Hastprofil, analys: Grovfoderanalys, produkter: Produkt[]): Plan {
  const behovsres = beraknaBehov(profil)
  const { behov, grovfoderKgTs } = behovsres
  const varningar: string[] = []
  const noteringar = [...behovsres.noteringar]
  const atgarder: Atgard[] = []
  const ts = analys.tsProcent / 100
  const energiBehov = behov.energi!.min!

  // Nuläge: grovfoder plus allt hästen får i dag.
  const nuvarande: Foderpost[] = []
  for (const f of profil.nuvarandeFoder) {
    const produkt = hittaProdukt(produkter, f.produktId)
    if (produkt) {
      nuvarande.push({ produkt, gramPerDag: f.gramPerDag })
      if (produkt.naringsdata !== 'komplett') {
        noteringar.push(`${produkt.namn} har ofullständig näringsdeklaration. Ämnen som inte anges räknas som noll.`)
      }
    } else noteringar.push(`"${f.namn}" finns inte i produktdatabasen och räknas inte med.`)
  }
  const nulageIntag = laggTill(grovfoderIntag(analys, profil.grovfoder.kgPerDag), nuvarande)
  const nulageKostnad = nuvarande.reduce((s, p) => s + kostnadPerManad(p.produkt, p.gramPerDag), 0)

  // Mineralfoder, tillskott och salt väljs om av urvalet. Allt annat behålls tills vidare.
  const ERSATTS = ['mineralfoder', 'tillskott', 'salt']
  let behallna = nuvarande.filter((p) => !ERSATTS.includes(p.produkt.kategori))
  let grovKg = profil.grovfoder.kgPerDag
  const energiFor = (kg: number, foder: Foderpost[]) =>
    laggTill(grovfoderIntag(analys, kg), foder).energi.varde

  // SLU: vid överhull minskas i första hand kraftfodret.
  if (energiFor(grovKg, behallna) > energiBehov * ENERGI_OVER) {
    for (const k of [...behallna].filter((p) => p.produkt.kategori === 'kraftfoder')) {
      behallna = behallna.filter((p) => p !== k)
      atgarder.push({
        typ: 'ta_bort',
        text: `Ta bort ${namn(k.produkt)} (${k.gramPerDag} g/dag). Grovfodret täcker energibehovet ändå.`,
      })
      if (energiFor(grovKg, behallna) <= energiBehov * ENERGI_OVER) break
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
      text: `Byt ${namn(p.produkt)} (${p.gramPerDag} g) mot ${b.till.gramPerDag} g ${namn(b.till.produkt)}: ${b.skal}, ${kr(b.besparingKrPerManad)} billigare i månaden.`,
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
  if (energiPerKgFoder > 0 && energiFor(grovKg, behallna) > energiBehov * ENERGI_OVER) {
    const ovrigEnergi = energiFor(0, behallna)
    const kgForEnergi = (energiBehov - ovrigEnergi) / energiPerKgFoder
    const nyKg = Math.max(kgForEnergi, grovfoderKgTs.minimum / ts)
    if (grovKg - nyKg > 0.3) {
      atgarder.push({
        typ: 'andra_grovfoder',
        text: `Minska grovfodret från ${fmt(grovKg)} till ${fmt(nyKg)} kg/dag. Lägre än ${fmt(grovfoderKgTs.minimum / ts)} kg/dag rekommenderas inte.`,
      })
      grovKg = nyKg
    }
  }

  // SLU: vid underhull ökas i första hand vallfodergivan.
  if (energiPerKgFoder > 0 && energiFor(grovKg, behallna) < energiBehov * ENERGI_UNDER) {
    const ovrigEnergi = energiFor(0, behallna)
    const kgForEnergi = (energiBehov - ovrigEnergi) / energiPerKgFoder
    const maxKg = grovfoderKgTs.rekommenderatMax / ts
    const nyKg = Math.min(kgForEnergi, maxKg)
    if (nyKg - grovKg > 0.3) {
      atgarder.push({ typ: 'andra_grovfoder', text: `Öka grovfodret från ${fmt(grovKg)} till ${fmt(nyKg)} kg/dag.` })
      grovKg = nyKg
    }
    if (energiFor(grovKg, behallna) < energiBehov * ENERGI_UNDER) {
      atgarder.push({
        typ: 'lagg_till_kraftfoder',
        text: 'Grovfodret räcker inte för energibehovet. Ett energirikare vallfoder eller ett kraftfoder behövs.',
      })
    }
  }

  const grovKgTs = grovKg * ts
  if (grovKgTs < grovfoderKgTs.minimum) {
    varningar.push(
      `Grovfodergivan (${fmt(grovKgTs)} kg ts) är under SLU:s minimum på ${fmt(grovfoderKgTs.minimum)} kg ts per dag.`,
    )
  }

  const bas = laggTill(grovfoderIntag(analys, grovKg), behallna)
  if (bas.smbRp.varde < behov.smbRp!.min!) {
    atgarder.push({
      typ: 'protein',
      text: 'Proteinet räcker inte. Ett proteinrikare vallfoder eller ett proteinfoder behövs.',
    })
  }

  const h = profil.halsa
  if (h.fang || h.ems || h.ppid) {
    varningar.push('Hästen har haft fång, har EMS eller PPID. Stäm av foderstaten med veterinär.')
    const socker = analys.perKgTs.socker
    if (socker === undefined) {
      varningar.push('Analysen saknar socker. Vid fång eller EMS bör sockerhalten i grovfodret vara känd.')
    } else if (socker > SOCKER_GRANS_G_PER_KG_TS) {
      varningar.push(
        `Grovfodret har ${fmt(socker)} g socker per kg ts, över ungefär ${SOCKER_GRANS_G_PER_KG_TS} g som brukar rekommenderas vid fång. Blötläggning sänker sockerhalten.`,
      )
    }
  }

  if (h.magsar || h.pssm) {
    varningar.push('Magsår och korsförlamning kräver veterinärens bedömning. Planen anpassar fodret men ersätter inte behandling.')
  }

  const { tillatna, uteslutna } = filtreraProdukter(produkter, h)
  const [urval, alternativ] = valjProdukter({
    bas,
    behov,
    produkter: tillatna,
    berakningsviktKg: behovsres.berakningsviktKg,
  })
  // Dagens mineralfoder, tillskott och salt ställs mot urvalet så att det syns vad som byts,
  // vad som tas bort och vad som är nytt, i stället för att gamla produkter bara försvinner.
  const nyaPoster = urval?.poster ?? []
  const ersatta = nuvarande.filter((p) => ERSATTS.includes(p.produkt.kategori))
  const hanterade = new Set<string>()
  for (const gammal of ersatta) {
    const kvar = nyaPoster.find((n) => n.produkt.id === gammal.produkt.id)
    if (kvar) {
      hanterade.add(kvar.produkt.id)
      atgarder.push({
        typ: 'tillskott',
        text:
          kvar.gramPerDag === gammal.gramPerDag
            ? `Fortsätt med ${kvar.gramPerDag} g/dag ${namn(kvar.produkt)}.`
            : `Ändra ${namn(kvar.produkt)} från ${gammal.gramPerDag} till ${kvar.gramPerDag} g/dag.`,
      })
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
    const fore = kostnadPerManad(gammal.produkt, gammal.gramPerDag)
    if (ersattare) {
      hanterade.add(ersattare.produkt.id)
      const efter = kostnadPerManad(ersattare.produkt, ersattare.gramPerDag)
      const skal =
        efter < fore - 1
          ? `täcker behovet, ${kr(fore - efter)} billigare i månaden`
          : 'täcker det som saknas bättre med ditt grovfoder'
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
        text: `Byt ${namn(gammal.produkt)} (${gammal.gramPerDag} g) mot ${ersattare.gramPerDag} g ${namn(ersattare.produkt)}: ${skal}.`,
      })
    } else {
      atgarder.push({
        typ: 'ta_bort',
        text: `Sluta med ${namn(gammal.produkt)} (${gammal.gramPerDag} g/dag, ${kr(fore)} i månaden). Behovet täcks utan den.`,
      })
    }
  }
  for (const p of nyaPoster) {
    if (hanterade.has(p.produkt.id)) continue
    atgarder.push({ typ: 'tillskott', text: `Ge ${p.gramPerDag} g/dag ${namn(p.produkt)}.` })
  }

  const slutIntag = urval?.intag ?? bas
  const styrande = styrandeAmnen(bas, behov)
  const resultat = balans(slutIntag, behov, styrande)
  const proteinOver = Math.max(0, slutIntag.smbRp.varde - behov.smbRp!.min!)
  // Kväve = protein / 6,25. Gram per dag till kg per år.
  const kvave = ((proteinOver / 6.25) * 365) / 1000

  return {
    behov: behovsres,
    nulage: balans(nulageIntag, behov, styrande),
    nulageKostnadPerManad: nulageKostnad,
    atgarder,
    grovfoderKgPerDag: grovKg,
    behallnaFoder: behallna,
    urval: urval ?? null,
    alternativ: alternativ ?? null,
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
      { intag: slutIntag.smbRp.varde, behov: behov.smbRp!.min! },
      behovsres.berakningsviktKg,
    ),
    bortvalda: uteslutna
      .filter((u) => u.produkt.iUrval)
      .map((u) => ({ namn: u.produkt.namn, skal: u.skal })),
    byten,
  }
}

function kr(n: number): string {
  return `${Math.round(n).toLocaleString('sv-SE')} kr`
}

function fmt(n: number): string {
  return n.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
}
