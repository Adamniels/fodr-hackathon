// The analysis resources (#26, CF4), per horse under /api/v1/horses/:id/analyses:
//   POST (multipart, field `file`): upload a report; the API reads it with the AI and stores the file and the values.
//   POST (JSON, CreateAnalysisSchema): an analysis without a file, for values typed in by hand.
//   GET  /current: the horse's current analysis, or null.
//   PUT  /:analysisId/values (ValuesSchema): corrected values, refused when the domain's validateAnalysis refuses them.
// The newest analysis is the current one. Field names are contract names (ADR 0016 rule 7); the checks at the end make
// a drift from the domain's types a compile error.
import { z } from 'zod'
import type { Omrakning } from '@fodr/domain/analysis'
import { NUTRIENT_KEYS, type NutrientKey } from '@fodr/domain/nutrients'
import type { Grovfoderanalys } from '@fodr/domain/types'

/** The largest report the API accepts, by type (CF4). An image above 5 MB is more than the AI accepts (ADR 0011). */
export const ANALYSIS_FILE_LIMITS = {
  'application/pdf': 20 * 1024 * 1024,
  'image/png': 5 * 1024 * 1024,
  'image/jpeg': 5 * 1024 * 1024,
  'image/webp': 5 * 1024 * 1024,
} as const

export type AnalysisMediaType = keyof typeof ANALYSIS_FILE_LIMITS
export const ANALYSIS_MEDIA_TYPES = Object.keys(ANALYSIS_FILE_LIMITS) as AnalysisMediaType[]

const nutrientKey = z.enum(NUTRIENT_KEYS as [NutrientKey, ...NutrientKey[]])

export const GrovfoderanalysSchema = z.object({
  typ: z.enum(['hosilage', 'ho']),
  labb: z.string().max(200).optional(),
  provdatum: z.string().max(40).optional(),
  tsProcent: z.number(),
  askaGPerKgTs: z.number().optional(),
  perKgTs: z.partialRecord(nutrientKey, z.number()),
})

export const OmrakningSchema = z.object({
  amne: nutrientKey,
  message: z.discriminatedUnion('code', [
    z.object({ code: z.literal('conversion.energyFromRuminant'), params: z.object({ mj: z.number() }) }),
    z.object({ code: z.literal('conversion.proteinFromCrude'), params: z.object({ grams: z.number() }) }),
  ]),
})

/** The values the plan uses, with the nutrients converted by an SLU formula. */
export const ValuesSchema = z.object({
  analys: GrovfoderanalysSchema,
  omrakningar: z.array(OmrakningSchema).max(NUTRIENT_KEYS.length),
})

export const CreateAnalysisSchema = z.object({ analys: GrovfoderanalysSchema })

export const AnalysisSchema = ValuesSchema.extend({
  id: z.uuid(),
  /** The AI's notes on what it was unsure of when reading the report; empty without a report. */
  anmarkningar: z.array(z.string()),
  /** Whether the original report is stored (an example has none). */
  hasFile: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
})

export const CurrentAnalysisSchema = z.object({ analysis: AnalysisSchema.nullable() })

export type Values = z.infer<typeof ValuesSchema>
export type Analysis = z.infer<typeof AnalysisSchema>

// Compile-time only, as in horses.ts: strict identity with the domain's types.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the generic T is the identity check
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
export type GrovfoderanalysMatchesDomain = Assert<Same<z.infer<typeof GrovfoderanalysSchema>, Grovfoderanalys>>
export type OmrakningMatchesDomain = Assert<Same<z.infer<typeof OmrakningSchema>, Omrakning>>
