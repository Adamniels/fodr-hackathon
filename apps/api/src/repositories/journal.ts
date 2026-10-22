// Journal entries, always for a user (ADR 0010): every query goes through the horse's membership. A horse that is not
// the user's is undefined (404). An entry made by saving a plan carries the plan's snapshot, derived from the stored
// plan when read (ogonblickAvPlan), so the plan is the one source.
import { JournalEntrySchema, type JournalEntry, type NewJournalEntry } from '@fodr/contracts/journal'
import type { Horse } from '@fodr/contracts/horses'
import type { User } from '@fodr/contracts/me'
import { ogonblickAvPlan } from '@fodr/domain/journal'
import { and, asc, eq, exists, sql } from 'drizzle-orm'
import type { Executor } from '../db'
import { horseMembers, horses, journalEntries, plans } from '../db/schema'
import { toHorse } from './horses'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type EntryRow = typeof journalEntries.$inferSelect
type PlanRow = typeof plans.$inferSelect

/** An entry as the contract has it, with its plan's snapshot when it has one. A missing value stays missing. */
export function toEntry(row: EntryRow, plan: PlanRow | null): JournalEntry {
  return JournalEntrySchema.parse({
    id: row.id,
    datum: row.date,
    ...(row.weightKg !== null && { viktKg: row.weightKg }),
    ...(row.bodyCondition !== null && { hull: row.bodyCondition }),
    text: row.text,
    ...(plan && { plan: ogonblickAvPlan(plan.result, plan.inputs.analys, plan.id) }),
    skapad: row.createdAt.toISOString(),
  })
}

export interface JournalRepository {
  list(user: Pick<User, 'id'>, horseId: string): Promise<JournalEntry[] | undefined>
  /** Adds the entry, and with `updateProfile` writes its weight and condition into the horse in the same transaction. */
  create(
    user: Pick<User, 'id'>,
    horseId: string,
    entry: NewJournalEntry,
  ): Promise<{ entry: JournalEntry; horse: Horse | null } | undefined>
}

export function journalRepository(db: Executor): JournalRepository {
  const isMember = (user: Pick<User, 'id'>, horseId: string) =>
    exists(
      db
        .select()
        .from(horseMembers)
        .where(and(eq(horseMembers.horseId, horseId), eq(horseMembers.userId, user.id))),
    )

  return {
    async list(user, horseId) {
      if (!UUID.test(horseId)) return undefined
      const members = await db
        .select({ horseId: horseMembers.horseId })
        .from(horseMembers)
        .where(and(eq(horseMembers.horseId, horseId), eq(horseMembers.userId, user.id)))
      if (members.length === 0) return undefined
      const rows = await db
        .select()
        .from(journalEntries)
        .leftJoin(plans, eq(plans.id, journalEntries.planId))
        .where(eq(journalEntries.horseId, horseId))
        .orderBy(asc(journalEntries.date), asc(journalEntries.createdAt), asc(journalEntries.id))
      return rows.map((r) => toEntry(r.journal_entries, r.plans))
    },

    async create(user, horseId, { datum, viktKg, hull, text, updateProfile }) {
      if (!UUID.test(horseId)) return undefined
      return db.transaction(async (tx) => {
        // The horse locked for the profile update, and against a delete between the check and the insert.
        const locked = (
          await tx
            .select()
            .from(horses)
            .where(and(eq(horses.id, horseId), isMember(user, horseId)))
            .for('update')
        ).at(0)
        if (!locked) return undefined
        const [row] = await tx
          .insert(journalEntries)
          .values({ horseId, date: datum, weightKg: viktKg ?? null, bodyCondition: hull ?? null, text })
          .returning()
        let horse: Horse | null = null
        if (updateProfile && (viktKg !== undefined || hull !== undefined)) {
          const profile = {
            ...locked.profile,
            ...(viktKg !== undefined && { viktKg }),
            ...(hull !== undefined && { hull }),
          }
          const [updated] = await tx
            .update(horses)
            .set({ profile, updatedAt: sql`now()` })
            .where(eq(horses.id, horseId))
            .returning()
          horse = toHorse(updated)
        }
        return { entry: toEntry(row, null), horse }
      })
    },
  }
}
