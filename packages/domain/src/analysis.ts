import type { NutrientKey, NutrientValues } from './nutrients'
import { energiHastFranIdisslare, smbRpFranRaprotein } from './slu'
import type { Grovfoderanalys, Grovfodertyp } from './types'

/** Det som AI:n läser ut ur rapporten, innan SLU-omräkningar. Speglar schemat i server/ai.ts. */
export interface UtlastAnalys {
  arAnalys: boolean
  typ: Grovfodertyp
  labb: string | null
  provdatum: string | null
  tsProcent: number | null
  askaGPerKgTs?: number | null
  perKgTs: Partial<Record<NutrientKey | 'energiIdisslare' | 'raprotein', number | null>>
  anmarkningar: string[]
}

export interface Omrakning {
  amne: NutrientKey
  text: string
}

export function tillGrovfoderanalys(u: UtlastAnalys): { analys: Grovfoderanalys; omrakningar: Omrakning[] } {
  if (!u.arAnalys) throw new Error('Dokumentet ser inte ut att vara en foderanalys.')
  if (!u.tsProcent) throw new Error('Hittade ingen torrsubstanshalt i analysen. Fyll i den manuellt.')
  const { energiIdisslare, raprotein, ...rest } = u.perKgTs
  const perKgTs: NutrientValues = {}
  for (const [k, v] of Object.entries(rest)) if (typeof v === 'number') perKgTs[k as NutrientKey] = v
  const omrakningar: Omrakning[] = []
  if (perKgTs.energi === undefined && energiIdisslare) {
    perKgTs.energi = round(energiHastFranIdisslare(energiIdisslare), 1)
    omrakningar.push({ amne: 'energi', text: `Räknat från idisslarvärdet ${energiIdisslare} MJ med SLU:s formel` })
  }
  if (perKgTs.smbRp === undefined && raprotein) {
    perKgTs.smbRp = round(smbRpFranRaprotein(raprotein), 0)
    omrakningar.push({ amne: 'smbRp', text: `Räknat från råprotein ${raprotein} g med SLU:s formel` })
  }
  return {
    analys: {
      typ: u.typ,
      labb: u.labb ?? undefined,
      provdatum: u.provdatum ?? undefined,
      tsProcent: u.tsProcent,
      ...(u.askaGPerKgTs ? { askaGPerKgTs: u.askaGPerKgTs } : {}),
      perKgTs,
    },
    omrakningar,
  }
}

function round(n: number, d: number) {
  const f = 10 ** d
  return Math.round(n * f) / f
}
