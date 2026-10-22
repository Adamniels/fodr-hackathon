// AI usage (#31, ADR 0015): a row for every call sent to the model, which the per-user daily quota counts. A call
// reserves its row before it is sent, under a lock on the user, so parallel calls can never pass the quota together;
// the row then records the tokens, the estimated cost and how it went.
import { and, eq, gte, sql } from 'drizzle-orm'
import type { Executor } from '../db'
import { aiUsage } from '../db/schema'

export type AiRoute = (typeof aiUsage.$inferInsert)['route']

// The start of today in Sweden, where the users are: the quota resets at midnight there. clock_timestamp(), like the
// rows' created_at, so a reservation that waited for the lock across midnight counts against the new day.
const startOfSwedishDay = sql`(date_trunc('day', clock_timestamp() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm')`

export interface UsageRepository {
  /** A pending row for the call, or null when the user has made `dailyLimit` calls today already. */
  reserve(userId: string, route: AiRoute, model: string, dailyLimit: number): Promise<string | null>
  /** Records how a reserved call went. */
  complete(
    id: string,
    result: { status: 'ok' | 'failed'; inputTokens: number; outputTokens: number; costSek: number },
  ): Promise<void>
  /** Removes a reservation for a call that never reached the model, so it neither counts nor costs. */
  release(id: string): Promise<void>
}

export function usageRepository(db: Executor): UsageRepository {
  return {
    reserve(userId, route, model, dailyLimit) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai_usage:${userId}`}))`)
        const [{ calls }] = await tx
          .select({ calls: sql<number>`count(*)::int` })
          .from(aiUsage)
          .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, startOfSwedishDay)))
        if (calls >= dailyLimit) return null
        const [row] = await tx
          .insert(aiUsage)
          .values({ userId, route, model, status: 'pending' })
          .returning({ id: aiUsage.id })
        return row.id
      })
    },

    async complete(id, result) {
      await db.update(aiUsage).set(result).where(eq(aiUsage.id, id))
    },

    async release(id) {
      await db.delete(aiUsage).where(eq(aiUsage.id, id))
    },
  }
}
