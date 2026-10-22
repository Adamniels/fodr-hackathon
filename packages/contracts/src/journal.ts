// The journal (#28, CF7), per horse under /api/v1/horses/:id/journal:
//   GET:  the entries, ordered by date and then by when they were made (sorteradePoster).
//   POST (NewJournalEntrySchema): a new entry; with `updateProfile` and a weight or body condition, the horse's profile
//        takes them in the same transaction, and the response carries the updated horse.
// An entry made by saving a plan (POST /plans with `journalDatum`) refers to the stored plan, and its snapshot is
// derived from that plan when read. Field names are contract names (ADR 0016 rule 7); the check at the end makes a
// drift from the domain's Journalpost a compile error.
import { z } from 'zod'
import type { Journalpost } from '@fodr/domain/journal'
import { HorseSchema } from './horses'

/** The longest entry text the server accepts; the form stops typing there. */
export const JOURNAL_TEXT_MAX = 2000

export const NewJournalEntrySchema = z.object({
  datum: z.string().max(10),
  viktKg: z.number().optional(),
  hull: z.number().optional(),
  text: z.string().max(JOURNAL_TEXT_MAX),
  updateProfile: z.boolean().optional(),
})

export const PlanOgonblickSchema = z.object({
  analys: z.union([
    z.string(),
    z.object({ typ: z.enum(['hosilage', 'ho']), labb: z.string().optional(), provdatum: z.string().optional() }),
  ]),
  planId: z.string().optional(),
  grovfoderKgPerDag: z.number(),
  produkter: z.array(z.object({ namn: z.string(), gramPerDag: z.number() })),
  kostnadPerManad: z.number(),
})

export const JournalEntrySchema = z.object({
  id: z.uuid(),
  datum: z.string(),
  viktKg: z.number().optional(),
  hull: z.number().optional(),
  text: z.string(),
  plan: PlanOgonblickSchema.optional(),
  skapad: z.iso.datetime({ offset: true }),
})

export const JournalSchema = z.object({ entries: z.array(JournalEntrySchema) })
export const CreatedJournalEntrySchema = z.object({ entry: JournalEntrySchema, horse: HorseSchema.nullable() })

export type NewJournalEntry = z.infer<typeof NewJournalEntrySchema>
export type JournalEntry = z.infer<typeof JournalEntrySchema>

// Compile-time only, as in horses.ts: an entry is the domain's Journalpost with the server's creation time always set.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the generic T is the identity check
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
export type JournalEntryMatchesDomain = Assert<Same<Omit<JournalEntry, 'skapad'>, Omit<Journalpost, 'skapad'>>>
export type JournalEntryCreatedIsSet = Assert<Same<JournalEntry['skapad'], string>>
