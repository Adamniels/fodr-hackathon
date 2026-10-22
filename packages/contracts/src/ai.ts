// The AI routes (#30, ADR 0007), signed-in users only:
//   POST /api/v1/ai/profile (ProfileRequestSchema): the owner's free text read into profile fields (CF3).
//   ExplanationRequestSchema: the plan as the page shows it, for its explanation in plain Swedish, which is written
//   for the saved plan under the plan routes (#32, ./plans).
//   POST /api/v1/ai/journal (JournalRequestSchema): the journal read for patterns, a vet flag and next steps (CF7).
// Only what a schema names reaches the model: unknown fields are dropped, and every text and list is capped, so the
// routes forward no arbitrary JSON (the open-proxy finding). Field names reach the model, so they are contract names
// (ADR 0016 rule 7). A parsed object takes the schema's key order, which follows what the web builds (the trend as the
// domain computes it); a nested object edited in the form may be reordered, which the model reads the same. The
// responses mirror the provider's output schemas in apps/api/src/ai/anthropic.ts, which a compile-time check keeps equal.
import { z } from 'zod'
import { INGREDIENSER } from '@fodr/domain/types'
import { HORSE_NAME_MAX, HORSE_NOTES_MAX, HorseProfileSchema } from './horses'
import { JOURNAL_TEXT_MAX } from './journal'

/** The free texts and follow-up answers of the profile fill; the form stops typing at these (#30). */
export const AI_TEXT_MAX = 4000
export const AI_ANSWER_MAX = 1000
/** The follow-up answers sent back with a fill; the web sends the latest ones. */
export const AI_ANSWERS_MAX = 10
/** The journal entries an analysis reads: the latest ones, which keeps the request and its cost bounded (#30). */
export const AI_JOURNAL_ENTRIES_MAX = 100

const text = (max: number) => z.string().max(max)
const halsa = HorseProfileSchema.shape.halsa

export const ProfileRequestSchema = z.object({
  foderText: text(AI_TEXT_MAX),
  halsaText: text(AI_TEXT_MAX),
  tidigareSvar: z.array(z.object({ fraga: text(500), svar: text(AI_ANSWER_MAX) })).max(AI_ANSWERS_MAX),
  produkter: z.array(z.object({ id: text(100), namn: text(200) })).max(500),
})

export const ProfileResponseSchema = z.object({
  grovfoderKgPerDag: z.number().nullable(),
  grovfoderTyp: z.enum(['hosilage', 'ho']).nullable(),
  nuvarandeFoder: z.array(z.object({ produktId: z.string().nullable(), namn: z.string(), gramPerDag: z.number() })),
  ras: z.string().nullable(),
  prestanda: z.enum(['fritid', 'tavling_lokal', 'tavling_hog', 'trav_galopp_traning', 'distans']).nullable(),
  miljo: z.object({
    hallning: z.enum(['box', 'losdrift']).nullable(),
    timmarUtePerDag: z.number().nullable(),
    klippt: z.boolean().nullable(),
    tacke: z.boolean().nullable(),
  }),
  fang: z.boolean(),
  ems: z.boolean(),
  ppid: z.boolean(),
  magsar: z.boolean(),
  pssm: z.boolean(),
  luftvagar: z.boolean(),
  tandproblem: z.boolean(),
  proteinkanslig: z.boolean(),
  undvik: z.array(z.enum(INGREDIENSER)),
  ovrigt: z.string(),
  foljdfragor: z.array(z.string()),
})

/** A nutrient row of the plan as the explanation gets it: labels already in Swedish, values rounded. */
const ExplanationRow = z.object({
  amne: text(100),
  behov: z.number().optional(),
  tillfort: z.number(),
  enhet: text(20),
  status: text(20),
  uppskattat: z.boolean(),
})

const lines = (max: number) => z.array(text(1000)).max(max)

export const ExplanationRequestSchema = z.object({
  hast: z.object({
    namn: text(HORSE_NAME_MAX),
    alder: z.number(),
    viktKg: z.number(),
    hull: z.number(),
    halsa,
    ovrigt: text(HORSE_NOTES_MAX),
  }),
  grovfoder: z.object({ typ: z.enum(['hosilage', 'ho']), kgPerDag: z.number() }),
  nulageMedDagensFoder: z.array(ExplanationRow).max(40),
  atgarder: lines(40),
  efterForslaget: z.array(ExplanationRow).max(40),
  kostnadMedForslagetKrPerManad: z.number(),
  kostnadIdagKrPerManad: z.number(),
  alternativ: z.object({ produkter: lines(20), kostnadKrPerManad: z.number() }).nullable(),
  byten: z
    .array(
      z.object({
        fran: text(300),
        till: text(300),
        varfor: text(1000),
        kostnadForeKrPerManad: z.number(),
        kostnadEfterKrPerManad: z.number(),
      }),
    )
    .max(50),
  kvaveOverskottKgPerAr: z.number(),
  omGrovfodret: lines(20),
  kansligheter: lines(20),
  bortvaldaProdukter: lines(300),
  varningar: lines(40),
  foderbyte: z.object({ dagar: z.number(), steg: z.number() }),
  saknasIAnalysen: lines(40),
})

/** A saved plan in the journal as the model reads it: its analysis as one line (JournalStep's forModel). */
const JournalPlan = z.object({
  analys: text(300),
  grovfoderKgPerDag: z.number(),
  produkter: z.array(z.object({ namn: text(200), gramPerDag: z.number() })).max(100),
  kostnadPerManad: z.number(),
})

export const JournalRequestSchema = z.object({
  hast: z.object({
    namn: text(HORSE_NAME_MAX),
    alderAr: z.number(),
    ras: text(100).nullable(),
    viktKg: z.number(),
    hull: z.number(),
    halsa,
  }),
  poster: z
    .array(
      z.object({
        id: text(100),
        datum: text(10),
        viktKg: z.number().optional(),
        hull: z.number().optional(),
        text: text(JOURNAL_TEXT_MAX),
        plan: JournalPlan.optional(),
      }),
    )
    .max(AI_JOURNAL_ENTRIES_MAX),
  // In the order the domain builds it (beraknaTrend), which the web keeps.
  trend: z.object({
    uppfoljningForfallen: z.boolean(),
    varningar: lines(10),
    vikt: z
      .object({ forsta: z.number(), senaste: z.number(), dagar: z.number(), procentPerVecka: z.number() })
      .optional(),
    hull: z.object({ forsta: z.number(), senaste: z.number() }).optional(),
    senastMatt: text(10).optional(),
    nastaUppfoljning: text(10).optional(),
  }),
  aktuellPlan: JournalPlan.nullable(),
})

export const JournalResponseSchema = z.object({
  sammanfattning: z.string(),
  monster: z.array(
    z.object({ iakttagelse: z.string(), mojligKoppling: z.string().nullable(), datum: z.string().nullable() }),
  ),
  veterinar: z.object({ behovs: z.boolean(), skal: z.string().nullable() }),
  nastaSteg: z.array(z.string()),
})

export type ProfileRequest = z.infer<typeof ProfileRequestSchema>
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>
export type ExplanationRequest = z.infer<typeof ExplanationRequestSchema>
export type JournalRequest = z.infer<typeof JournalRequestSchema>
export type JournalResponse = z.infer<typeof JournalResponseSchema>
