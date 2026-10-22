// Saved plans, always for a user (ADR 0010): every query goes through the horse's membership, so a handler cannot
// reach a plan of a horse the user is not a member of. Not found and not the user's are the same: undefined (404).
// Plans are immutable: there is no update. Saving what the newest plan was computed from returns that plan (#32).
import type { User } from '@fodr/contracts/me'
import { SavedPlanSchema, type SavedPlan } from '@fodr/contracts/plans'
import { and, desc, eq, exists, sql } from 'drizzle-orm'
import type { Executor } from '../db'
import type { JournalEntry } from '@fodr/contracts/journal'
import { horseMembers, horses, journalEntries, plans } from '../db/schema'
import { toEntry } from './journal'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Row = typeof plans.$inferSelect

// Parsed on the way out: the envelope field by field, the plan as the domain's type (contracts/plans.ts).
export const toPlan = (row: Row): SavedPlan =>
  SavedPlanSchema.parse({
    id: row.id,
    horseId: row.horseId,
    analysisId: row.analysisId,
    inputs: row.inputs,
    result: row.result,
    engineVersion: row.engineVersion,
    productSetVersion: row.productSetVersion,
    createdAt: row.createdAt.toISOString(),
  })

export type NewPlan = Omit<SavedPlan, 'id' | 'horseId' | 'createdAt'>

export interface PlanRepository {
  /**
   * Stores the plan, and with a journal date its journal entry in the same transaction (#28); undefined when the horse
   * is not the user's (or is gone). When the horse's newest plan has the same inputs, build and catalogue, that plan is
   * returned instead (`created` false) and a journal entry refers to it (#32).
   */
  create(
    user: Pick<User, 'id'>,
    horseId: string,
    plan: NewPlan,
    journalDatum?: string,
  ): Promise<{ plan: SavedPlan; entry: JournalEntry | null; created: boolean } | undefined>
  /** The newest saved plan, null without one, undefined when the horse is not the user's. */
  latest(user: Pick<User, 'id'>, horseId: string): Promise<SavedPlan | null | undefined>
}

export function planRepository(db: Executor): PlanRepository {
  const isMember = (user: Pick<User, 'id'>, horseId: string) =>
    exists(
      db
        .select()
        .from(horseMembers)
        .where(and(eq(horseMembers.horseId, horseId), eq(horseMembers.userId, user.id))),
    )

  return {
    async create(user, horseId, plan, journalDatum) {
      if (!UUID.test(horseId)) return undefined
      return db.transaction(async (tx) => {
        // A share lock: a delete of the horse (which locks it for update) waits for this insert or runs first.
        const locked = await tx
          .select({ id: horses.id })
          .from(horses)
          .where(and(eq(horses.id, horseId), isMember(user, horseId)))
          .for('share')
        if (locked.length === 0) return undefined
        // Saves of the horse's plans one at a time, so identical saves made together (a second render, two tabs) find
        // the first one's plan rather than each storing one.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`plans:${horseId}`}))`)
        // Only the newest plan is reused: an older one with the same inputs is not what the horse's plan is now.
        // jsonb equality ignores key order.
        const latest = await tx
          .select({ plan: plans, sameInputs: sql<boolean>`${plans.inputs} = ${JSON.stringify(plan.inputs)}::jsonb` })
          .from(plans)
          .where(eq(plans.horseId, horseId))
          .orderBy(desc(plans.createdAt), desc(plans.id))
          .limit(1)
        const newest = latest.at(0)
        const same =
          newest !== undefined &&
          newest.sameInputs &&
          newest.plan.engineVersion === plan.engineVersion &&
          newest.plan.productSetVersion === plan.productSetVersion
        const row = same
          ? newest.plan
          : (
              await tx
                .insert(plans)
                .values({ horseId, ...plan })
                .returning()
            )[0]
        if (journalDatum === undefined) return { plan: toPlan(row), entry: null, created: !same }
        const [entry] = await tx
          .insert(journalEntries)
          .values({ horseId, date: journalDatum, text: '', planId: row.id })
          .returning()
        return { plan: toPlan(row), entry: toEntry(entry, row), created: !same }
      })
    },

    async latest(user, horseId) {
      if (!UUID.test(horseId)) return undefined
      const members = await db
        .select({ horseId: horseMembers.horseId })
        .from(horseMembers)
        .where(and(eq(horseMembers.horseId, horseId), eq(horseMembers.userId, user.id)))
      if (members.length === 0) return undefined
      const rows = await db
        .select()
        .from(plans)
        .where(eq(plans.horseId, horseId))
        .orderBy(desc(plans.createdAt), desc(plans.id))
        .limit(1)
      return rows.map(toPlan).at(0) ?? null
    },
  }
}
