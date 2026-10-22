// Plan explanations (#32, CF6), always for a user (ADR 0010): a plan is reached through its horse's membership, so a
// handler cannot read or write the explanation of a plan the user cannot see. Not found and not the user's are the
// same: undefined (404).
import type { User } from '@fodr/contracts/me'
import type { PlanExplanation } from '@fodr/contracts/plans'
import { and, eq, exists } from 'drizzle-orm'
import type { Executor } from '../db'
import { horseMembers, planExplanations, plans } from '../db/schema'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Explanation = NonNullable<PlanExplanation['explanation']>

export interface ExplanationRepository {
  /** Whether the plan is the user's, under this horse. */
  canReach(user: Pick<User, 'id'>, horseId: string, planId: string): Promise<boolean>
  /** The plan's explanation, null without one, undefined when the plan is not the user's under this horse. */
  get(user: Pick<User, 'id'>, horseId: string, planId: string): Promise<Explanation | null | undefined>
  /** Stores the plan's explanation, replacing one there was; undefined when the plan is not the user's (or is gone). */
  put(
    user: Pick<User, 'id'>,
    horseId: string,
    planId: string,
    explanation: { text: string; model: string },
  ): Promise<Explanation | undefined>
}

export function explanationRepository(db: Executor): ExplanationRepository {
  const reachable = (user: Pick<User, 'id'>, horseId: string, planId: string) =>
    and(
      eq(plans.id, planId),
      eq(plans.horseId, horseId),
      exists(
        db
          .select()
          .from(horseMembers)
          .where(and(eq(horseMembers.horseId, horseId), eq(horseMembers.userId, user.id))),
      ),
    )
  const toExplanation = (row: { text: string; createdAt: Date }): Explanation => ({
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  })

  return {
    async canReach(user, horseId, planId) {
      if (!UUID.test(horseId) || !UUID.test(planId)) return false
      const rows = await db
        .select({ id: plans.id })
        .from(plans)
        .where(reachable(user, horseId, planId))
      return rows.length > 0
    },

    async get(user, horseId, planId) {
      if (!UUID.test(horseId) || !UUID.test(planId)) return undefined
      const rows = await db
        .select({ text: planExplanations.text, createdAt: planExplanations.createdAt })
        .from(plans)
        .leftJoin(planExplanations, eq(planExplanations.planId, plans.id))
        .where(reachable(user, horseId, planId))
      if (rows.length === 0) return undefined
      const [row] = rows
      return row.text === null || row.createdAt === null
        ? null
        : toExplanation({ text: row.text, createdAt: row.createdAt })
    },

    async put(user, horseId, planId, explanation) {
      if (!UUID.test(horseId) || !UUID.test(planId)) return undefined
      return db.transaction(async (tx) => {
        // A share lock: a delete of the plan's horse waits for this write or runs first, as for saving a plan.
        const locked = await tx
          .select({ id: plans.id })
          .from(plans)
          .where(reachable(user, horseId, planId))
          .for('share')
        if (locked.length === 0) return undefined
        const [row] = await tx
          .insert(planExplanations)
          .values({ planId, ...explanation })
          .onConflictDoUpdate({ target: planExplanations.planId, set: { ...explanation, createdAt: new Date() } })
          .returning()
        return toExplanation(row)
      })
    },
  }
}
