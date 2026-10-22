// Saved plans and the product catalogue (#27, CF5, ADR 0004):
//   GET  /api/v1/products: the catalogue the engine plans with, and its version (public; the ETag is the version).
//   POST /api/v1/horses/:id/plans (SavePlanSchema): the server computes the plan from the horse, the analysis and the
//        catalogue, stores it immutably with the engine and catalogue versions, and returns it.
//   GET  /api/v1/horses/:id/plans/latest: the horse's newest saved plan, or null.
// The envelope is validated field by field. The plan itself and the catalogue's products are typed as the domain's
// types rather than mirrored in zod: web and API ship from one build, and each stored plan names the engine version
// that computed it (ADR 0007 note, owner, #27).
import { z } from 'zod'
import type { Plan } from '@fodr/domain/plan'
import type { Produkt } from '@fodr/domain/types'
import { GrovfoderanalysSchema } from './analyses'
import { HorseSchema } from './horses'

const record = (value: unknown) => typeof value === 'object' && value !== null && !Array.isArray(value)

export const ProductCatalogueSchema = z.object({
  version: z.string().min(1),
  products: z.array(z.custom<Produkt>(record)),
})

export const SavePlanSchema = z.object({ analysisId: z.uuid() })

export const SavedPlanSchema = z.object({
  id: z.uuid(),
  horseId: z.uuid(),
  analysisId: z.uuid(),
  /** What the plan was computed from: the profile and the analysis values as they were (CF5). */
  inputs: z.object({ profil: HorseSchema, analys: GrovfoderanalysSchema }),
  result: z.custom<Plan>(record),
  /** The build that computed it (its git commit), and the catalogue it chose from. */
  engineVersion: z.string().min(1),
  productSetVersion: z.string().min(1),
  createdAt: z.iso.datetime({ offset: true }),
})

export const LatestPlanSchema = z.object({ plan: SavedPlanSchema.nullable() })

export type ProductCatalogue = z.infer<typeof ProductCatalogueSchema>
export type SavedPlan = z.infer<typeof SavedPlanSchema>
