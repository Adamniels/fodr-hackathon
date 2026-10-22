// Saved plans and the product catalogue (#27, CF5, ADR 0004):
//   GET  /api/v1/products: the catalogue the engine plans with, and its version (public; the ETag is the version).
//   POST /api/v1/horses/:id/plans (SavePlanSchema): the server computes the plan from the horse, the analysis and the
//        catalogue, stores it immutably with the engine and catalogue versions, and returns it; with `journalDatum`
//        (the user's local date) it also makes the journal entry for it, in the same transaction (#28).
//   GET  /api/v1/horses/:id/plans/latest: the horse's newest saved plan, or null.
// The envelope is validated field by field. The plan, the inputs it was computed from and the catalogue's products are
// typed as the domain's types rather than mirrored in zod: web and API ship from one build, and a stored plan is a
// record of the past. Validating it against today's schemas would refuse or strip an older plan's inputs once the
// profile changes shape; each plan names the engine version that computed it instead (ADR 0007 note, owner, #27).
import { z } from 'zod'
import type { Plan } from '@fodr/domain/plan'
import type { Grovfoderanalys, Hastprofil, Produkt } from '@fodr/domain/types'
import { JournalEntrySchema } from './journal'

const record = (value: unknown) => typeof value === 'object' && value !== null && !Array.isArray(value)

export const ProductCatalogueSchema = z.object({
  version: z.string().min(1),
  products: z.array(z.custom<Produkt>(record)),
})

export const SavePlanSchema = z.object({ analysisId: z.uuid(), journalDatum: z.string().max(10).optional() })

export const SavedPlanSchema = z.object({
  id: z.uuid(),
  horseId: z.uuid(),
  analysisId: z.uuid(),
  /** What the plan was computed from: the profile and the analysis values as they were (CF5). */
  inputs: z.object({ profil: z.custom<Hastprofil>(record), analys: z.custom<Grovfoderanalys>(record) }),
  result: z.custom<Plan>(record),
  /** The build that computed it (its git commit), and the catalogue it chose from. */
  engineVersion: z.string().min(1),
  productSetVersion: z.string().min(1),
  createdAt: z.iso.datetime({ offset: true }),
})

export const LatestPlanSchema = z.object({ plan: SavedPlanSchema.nullable() })
export const SavedPlanResponseSchema = z.object({ plan: SavedPlanSchema, entry: JournalEntrySchema.nullable() })

export type ProductCatalogue = z.infer<typeof ProductCatalogueSchema>
export type SavedPlan = z.infer<typeof SavedPlanSchema>
