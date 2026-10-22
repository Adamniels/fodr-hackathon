// The horse resources (#24, CF2): GET/POST /api/v1/horses, GET/PUT/DELETE /api/v1/horses/:id. A horse is the domain's
// Hastprofil with the server's ID; field names are contract names (ADR 0016 rule 7). The schema checks shape and
// types, with caps against abuse, not the ranges: an out-of-range value saves as a draft and the engine refuses to
// plan with it (validateProfile, owner, #24). The check at the end makes a drift from Hastprofil a compile error.
import { z } from 'zod'
import { INGREDIENSER, type Hastprofil } from '@fodr/domain/types'

const number = z.number()

export const HorseProfileSchema = z.object({
  namn: z.string().max(100),
  alderAr: number,
  kon: z.enum(['sto', 'valack', 'hingst']),
  typ: z.enum(['lattfodd', 'normalfodd', 'svarfodd']),
  viktKg: number,
  hull: number,
  viktVidNormalHullKg: number.optional(),
  ras: z.string().max(50).optional(),
  ridning: z.object({ passPerVecka: number, minuterPerPass: number, travGaloppMinPerPass: number }).optional(),
  arbetsniva: z.enum(['ingen', 'latt', 'medel', 'hart', 'mycket_hart']).optional(),
  prestanda: z.enum(['fritid', 'tavling_lokal', 'tavling_hog', 'trav_galopp_traning', 'distans']).optional(),
  miljo: z
    .object({
      hallning: z.enum(['box', 'losdrift']),
      timmarUtePerDag: number,
      klippt: z.boolean(),
      tacke: z.boolean(),
      lagstaTempC: number,
    })
    .optional(),
  halsa: z.object({
    fang: z.boolean(),
    ems: z.boolean(),
    ppid: z.boolean().optional(),
    magsar: z.boolean().optional(),
    pssm: z.boolean().optional(),
    luftvagar: z.boolean().optional(),
    tandproblem: z.boolean().optional(),
    proteinkanslig: z.boolean().optional(),
    undvik: z.array(z.enum(INGREDIENSER)).max(INGREDIENSER.length).optional(),
    ovrigt: z.string().max(2000),
  }),
  bytekanslighet: z.enum(['tal', 'normal', 'kanslig']).optional(),
  grovfoder: z.object({ typ: z.enum(['hosilage', 'ho']), kgPerDag: number }),
  nuvarandeFoder: z
    .array(z.object({ produktId: z.string().max(100).nullable(), namn: z.string().max(200), gramPerDag: number }))
    .max(50),
})

export const HorseSchema = HorseProfileSchema.extend({ id: z.uuid() })
export const HorseListSchema = z.object({ horses: z.array(HorseSchema) })

export type HorseProfile = z.infer<typeof HorseProfileSchema>
export type Horse = z.infer<typeof HorseSchema>

// Compile-time only: the schema is exactly the domain's profile without its ID. Strict identity, which also tells a
// missing optional field apart (mutual assignability would not); Assert fails to compile unless it gets true.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the generic T is the identity check
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
export type HorseProfileMatchesDomain = Assert<Same<HorseProfile, Omit<Hastprofil, 'id'>>>
