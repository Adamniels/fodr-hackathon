// Jämför foder som hästen redan äter med liknande produkter och föreslår ett billigare byte.
// "Liknande" betyder samma sorts foder med ungefär samma energi och protein per kg, inte mer
// stärkelse eller nya känsliga ingredienser, och inget som hästens känsligheter talar emot.
// Givan räknas om så att hästen får lika mycket energi som i dag.

import { skalMotProdukt } from './kanslighet'
import type { Byteskal } from './meddelanden'
import { kostnadPerManad, type Foderpost } from './intake'
import type { Halsa, Produkt } from './types'

export interface Byte {
  fran: Foderpost
  till: Foderpost
  kostnadFore: number
  kostnadEfter: number
  besparingKrPerManad: number
  skal: Byteskal
}

const LIKNANDE_KATEGORIER = ['kraftfoder', 'proteinfoder']
// ANTAGANDE: energi inom ±15 % och protein per MJ inom ±25 % räknas som likvärdigt foder.
const ENERGI_TOLERANS = 0.15
const PROTEIN_TOLERANS = 0.25
// ANTAGANDE: stärkelse får öka med högst 20 % (plus 20 g/kg för avrundning i deklarationer).
const STARKELSE_MARGINAL = 1.2
// Bytet ska vara värt besväret.
const MIN_BESPARING_KR = 20
const MIN_BESPARING_ANDEL = 0.1
// Storsäckar passar inte en enskild hästägare.
const MAX_FORPACKNING_KG = 30
// Ingredienser som inte får tillkomma vid ett byte, eftersom ägaren kan ha valt bort dem medvetet.
// eslint-disable-next-line no-restricted-syntax -- ingredient identifiers (the Ingrediens type), not text
const SKYDDADE_INGREDIENSER = ['spannmål', 'melass', 'soja', 'lusern']

/** Om produkten kan ersätta dagens foder utan att hästen märker någon skillnad i näring. */
function likvardig(fran: Produkt, kandidat: Produkt, halsa: Halsa): boolean {
  if (kandidat.id === fran.id) return false
  if (!LIKNANDE_KATEGORIER.includes(kandidat.kategori)) return false
  if (kandidat.forpackningKg > MAX_FORPACKNING_KG) return false
  if (kandidat.naringsdata === 'saknas') return false
  if (skalMotProdukt(kandidat, halsa).length > 0) return false
  if (fran.lampligVidFangEms && !kandidat.lampligVidFangEms) return false

  const e1 = fran.perKg.energi
  const e2 = kandidat.perKg.energi
  if (!e1 || !e2 || Math.abs(e2 / e1 - 1) > ENERGI_TOLERANS) return false

  const p1 = fran.perKg.smbRp
  const p2 = kandidat.perKg.smbRp
  if (p1 !== undefined) {
    if (p2 === undefined) return false
    if (Math.abs(p2 / e2 / (p1 / e1) - 1) > PROTEIN_TOLERANS) return false
  }

  const s1 = fran.perKg.starkelse
  const s2 = kandidat.perKg.starkelse
  if (s1 !== undefined && (s2 === undefined || s2 > s1 * STARKELSE_MARGINAL + 20)) return false

  for (const i of SKYDDADE_INGREDIENSER) {
    if (kandidat.ingredienser.includes(i) && !fran.ingredienser.includes(i)) return false
  }
  return true
}

/** Givan av den nya produkten som ger samma energi som dagens giva, avrundad till 10 g. */
function sammaEnergi(fran: Foderpost, till: Produkt): number {
  const gram = (fran.gramPerDag * fran.produkt.perKg.energi!) / till.perKg.energi!
  return Math.max(10, Math.round(gram / 10) * 10)
}

/** Billigaste likvärdiga byte för ett foder, om det finns ett som sparar tillräckligt. */
export function hittaBilligareLiknande(fran: Foderpost, produkter: Produkt[], halsa: Halsa): Byte | null {
  if (!LIKNANDE_KATEGORIER.includes(fran.produkt.kategori)) return null
  const kostnadFore = kostnadPerManad(fran.produkt, fran.gramPerDag)
  let basta: Byte | null = null
  for (const kandidat of produkter) {
    if (!likvardig(fran.produkt, kandidat, halsa)) continue
    const till: Foderpost = { produkt: kandidat, gramPerDag: sammaEnergi(fran, kandidat) }
    const kostnadEfter = kostnadPerManad(kandidat, till.gramPerDag)
    const besparing = kostnadFore - kostnadEfter
    if (besparing < MIN_BESPARING_KR || besparing < kostnadFore * MIN_BESPARING_ANDEL) continue
    if (!basta || kostnadEfter < basta.kostnadEfter) {
      basta = {
        fran,
        till,
        kostnadFore,
        kostnadEfter,
        besparingKrPerManad: besparing,
        skal: skalText(fran.produkt, kandidat),
      }
    }
  }
  return basta
}

function skalText(fran: Produkt, till: Produkt): Byteskal {
  const bas = (namn: string) => namn.replace(/\s*[\d,]+\s*(kg|l)\b.*$/i, '').trim()
  if (bas(fran.namn) === bas(till.namn)) return { code: 'swapReason.samePackCheaper', params: {} }
  return { code: 'swapReason.sameEnergy', params: {} }
}
