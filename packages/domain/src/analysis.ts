import type { AnalysisErrorMessage, ConversionMessage } from './messages'
import type { NutrientKey, NutrientValues } from './nutrients'
import { energiHastFranIdisslare, smbRpFranRaprotein } from './slu'
import type { Grovfoderanalys, Grovfodertyp } from './types'

/** What the AI reads from the report, before SLU conversions. Mirrors the schema in server/ai.ts. */
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
  message: ConversionMessage
}

/** The analysis with its conversions, or why the report cannot be used (ADR 0013: expected outcomes are values). */
export type AnalysisResult = { analys: Grovfoderanalys; omrakningar: Omrakning[] } | { error: AnalysisErrorMessage }

export function tillGrovfoderanalys(u: UtlastAnalys): AnalysisResult {
  if (!u.arAnalys) return { error: { code: 'analysis.notAnAnalysis', params: {} } }
  // A present 0 is a value, never unknown (#102): it loads, and the validator shows it is out of range.
  if (u.tsProcent == null) return { error: { code: 'analysis.missingDryMatter', params: {} } }
  const { energiIdisslare, raprotein, ...rest } = u.perKgTs
  const perKgTs: NutrientValues = {}
  for (const [k, v] of Object.entries(rest)) if (typeof v === 'number') perKgTs[k as NutrientKey] = v
  const omrakningar: Omrakning[] = []
  // A ruminant energy or crude protein of 0 is not converted: SLU's crude protein formula divides by it (NaN) and
  // the energy formula would give a negative value, so the horse value stays unknown.
  if (perKgTs.energi === undefined && energiIdisslare) {
    perKgTs.energi = round(energiHastFranIdisslare(energiIdisslare), 1)
    omrakningar.push({
      amne: 'energi',
      message: { code: 'conversion.energyFromRuminant', params: { mj: energiIdisslare } },
    })
  }
  if (perKgTs.smbRp === undefined && raprotein) {
    perKgTs.smbRp = round(smbRpFranRaprotein(raprotein), 0)
    omrakningar.push({ amne: 'smbRp', message: { code: 'conversion.proteinFromCrude', params: { grams: raprotein } } })
  }
  return {
    analys: {
      typ: u.typ,
      labb: u.labb ?? undefined,
      provdatum: u.provdatum ?? undefined,
      tsProcent: u.tsProcent,
      ...(u.askaGPerKgTs != null ? { askaGPerKgTs: u.askaGPerKgTs } : {}),
      perKgTs,
    },
    omrakningar,
  }
}

function round(n: number, d: number) {
  const f = 10 ** d
  return Math.round(n * f) / f
}
