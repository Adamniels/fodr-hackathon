// Injusteringsplan: hur dagens foder trappas över till den nya foderstaten, steg för steg.
// Hur fort det får gå styrs av hur känslig hästen är för foderbyten, som ägaren anger.
// Mikroberna i grovtarmen behöver tid att anpassa sig; för snabba byten ökar risken för
// lös avföring, kolik och, hos fångbenägna hästar, fång.

import { displayName, type Foderpost } from './intake'
import type { Bytekanslighet, Grovfodertyp, Halsa } from './types'

/** How fast a feed transition goes. Its name and description for the owner are in the web app's catalogue. */
export interface Bytestakt {
  /** Hela bytets längd i dagar. */
  dagar: number
  /** Dagar mellan varje ändring av måtten. */
  dagarPerSteg: number
}

// ANTAGANDE: 1–2 veckor är vanlig branschpraxis för foderbyten. SLU Rapport 289 anger att
// förändringar ska göras gradvis men ingen exakt takt.
export const BYTESTAKT: Record<Bytekanslighet, Bytestakt> = {
  tal: { dagar: 7, dagarPerSteg: 2 },
  normal: { dagar: 10, dagarPerSteg: 2 },
  kanslig: { dagar: 14, dagarPerSteg: 3 },
}

/** Förval när ägaren inte har angett något: hästar med fång, EMS, PPID, magsår eller PSSM räknas som känsliga. */
export function standardKanslighet(h: Halsa): Bytekanslighet {
  return h.fang || h.ems || h.ppid || h.magsar || h.pssm ? 'kanslig' : 'normal'
}

export interface Injusteringssteg {
  nr: number
  /** Dag 1 är bytets första dag. */
  startDag: number
  /** Sista dagen med det här steget, eller null för sista steget som gäller tills vidare. */
  slutDag: number | null
}

interface Radmangd {
  fran: number
  till: number
  /** Mängd per dag i varje steg, i samma ordning som stegen. */
  perSteg: number[]
}

/** Grovfodret vägs i kg och bär sin typ, som webben namnger; produkter vägs i gram och bär produktens namn. */
export type Injusteringsrad =
  (Radmangd & { enhet: 'kg'; grovfodertyp: Grovfodertyp }) | (Radmangd & { enhet: 'g'; namn: string })

export interface Injustering {
  kanslighet: Bytekanslighet
  /** Sant om känsligheten är förvald utifrån hälsan och inte angiven av ägaren. */
  forvald: boolean
  dagar: number
  steg: Injusteringssteg[]
  /** Bara foder som ändras. Tom lista betyder att inget behöver trappas. */
  rader: Injusteringsrad[]
}

// Grovfoder vägs i halva kilo, kraftfoder och tillskott i tiotal gram (femtal under 100 g).
const roundKg = (kg: number) => Math.round(kg * 2) / 2
const roundGrams = (g: number, max: number) => (max < 100 ? Math.round(g / 5) * 5 : Math.round(g / 10) * 10)
// Grovfoderändringar under ett halvt kilo är inget att trappa.
const MIN_GROVFODER_ANDRING_KG = 0.5

export function skapaInjustering(args: {
  halsa: Halsa
  kanslighet?: Bytekanslighet
  grovfodertyp: Grovfodertyp
  grovfoderFranKg: number
  grovfoderTillKg: number
  fran: Foderpost[]
  till: Foderpost[]
}): Injustering {
  const kanslighet = args.kanslighet ?? standardKanslighet(args.halsa)
  const takt = BYTESTAKT[kanslighet]
  const antal = Math.ceil(takt.dagar / takt.dagarPerSteg)
  const steg: Injusteringssteg[] = Array.from({ length: antal }, (_, i) => ({
    nr: i + 1,
    startDag: 1 + i * takt.dagarPerSteg,
    slutDag: i === antal - 1 ? null : (i + 1) * takt.dagarPerSteg,
  }))
  // Steg i (1-baserat) ger andelen i/antal av förändringen; sista steget är alltid den nya givan.
  const trappa = (fran: number, till: number, round: (v: number) => number) =>
    steg.map((s) => (s.nr === antal ? till : round(fran + ((till - fran) * s.nr) / antal)))

  const rader: Injusteringsrad[] = []
  const { grovfoderFranKg: gf, grovfoderTillKg: gt } = args
  if (Math.abs(gt - gf) >= MIN_GROVFODER_ANDRING_KG) {
    const till = roundKg(gt)
    rader.push({ enhet: 'kg', grovfodertyp: args.grovfodertyp, fran: gf, till, perSteg: trappa(gf, till, roundKg) })
  }

  // Samma produkt kan finnas i både dagens och nya fodret; slå ihop på produkt-id.
  const summa = (poster: Foderpost[]) => {
    const m = new Map<string, Foderpost>()
    for (const p of poster) {
      const f = m.get(p.produkt.id)
      m.set(p.produkt.id, { produkt: p.produkt, gramPerDag: (f?.gramPerDag ?? 0) + p.gramPerDag })
    }
    return m
  }
  const fran = summa(args.fran)
  const till = summa(args.till)
  for (const id of new Set([...fran.keys(), ...till.keys()])) {
    const post = fran.get(id) ?? till.get(id)
    if (!post) continue
    const produkt = post.produkt
    const a = fran.get(id)?.gramPerDag ?? 0
    const b = till.get(id)?.gramPerDag ?? 0
    if (a === b) continue
    rader.push({
      enhet: 'g',
      namn: displayName(produkt),
      fran: a,
      till: b,
      perSteg: trappa(a, b, (v) => roundGrams(v, Math.max(a, b))),
    })
  }

  return { kanslighet, forvald: args.kanslighet === undefined, dagar: takt.dagar, steg, rader }
}
