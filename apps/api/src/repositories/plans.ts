// Saved plans, always for a user (ADR 0010): every query goes through the horse's membership, so a handler cannot
// reach a plan of a horse the user is not a member of. Not found and not the user's are the same: undefined (404).
// Plans are immutable: there is no update.
import type { User } from '@fodr/contracts/me'
import { SavedPlanSchema, type SavedPlan } from '@fodr/contracts/plans'
import { and, desc, eq, exists } from 'drizzle-orm'
import type { Database } from '../db'
import { horseMembers, horses, plans } from '../db/schema'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Row = typeof plans.$inferSelect

// Parsed on the way out: the envelope field by field, the plan as the domain's type (contracts/plans.ts).
const toPlan = (row: Row): SavedPlan =>
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
  /** Stores the plan; undefined when the horse is not the user's (or is gone). */
  create(user: Pick<User, 'id'>, horseId: string, plan: NewPlan): Promise<SavedPlan | undefined>
  /** The newest saved plan, null without one, undefined when the horse is not the user's. */
  latest(user: Pick<User, 'id'>, horseId: string): Promise<SavedPlan | null | undefined>
}

export function planRepository(db: Database['db']): PlanRepository {
  const isMember = (user: Pick<User, 'id'>, horseId: string) =>
    exists(
      db
        .select()
        .from(horseMembers)
        .where(and(eq(horseMembers.horseId, horseId), eq(horseMembers.userId, user.id))),
    )

  return {
    async create(user, horseId, plan) {
      if (!UUID.test(horseId)) return undefined
      return db.transaction(async (tx) => {
        // A share lock: a delete of the horse (which locks it for update) waits for this insert or runs first.
        const locked = await tx
          .select({ id: horses.id })
          .from(horses)
          .where(and(eq(horses.id, horseId), isMember(user, horseId)))
          .for('share')
        if (locked.length === 0) return undefined
        const [row] = await tx
          .insert(plans)
          .values({ horseId, ...plan })
          .returning()
        return toPlan(row)
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
