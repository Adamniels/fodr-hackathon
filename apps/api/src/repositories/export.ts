// Everything the app holds about a user, for their export (#40, CF8), always for the user (ADR 0010): their account,
// the horses they are a member of with each horse's analyses (and where its report is stored), saved plans with their
// explanations, and their AI usage. The journal comes from the journal repository, which derives each entry's plan
// snapshot as the screen shows it.
import type { User } from '@fodr/contracts/me'
import type { Horse } from '@fodr/contracts/horses'
import type { Analysis } from '@fodr/contracts/analyses'
import type { SavedPlan } from '@fodr/contracts/plans'
import { and, asc, eq, exists, inArray } from 'drizzle-orm'
import type { Executor } from '../db'
import { aiUsage, analyses, horseMembers, horses, planExplanations, plans, users } from '../db/schema'
import { toAnalysis } from './analyses'
import { toHorse } from './horses'
import { toPlan } from './plans'

export interface ExportedHorse {
  horse: Horse
  analyses: Analysis[]
  /** The uploaded reports in the file store, by analysis. */
  reports: { analysisId: string; key: string; mediaType: string }[]
  plans: (SavedPlan & { explanation: { text: string; createdAt: string } | null })[]
}

export interface UserExport {
  account: { id: string; name: string; email: string; createdAt: string }
  horses: ExportedHorse[]
  aiUsage: {
    route: string
    model: string
    status: string
    inputTokens: number
    outputTokens: number
    costSek: number
    createdAt: string
  }[]
}

export interface ExportRepository {
  forUser(user: Pick<User, 'id'>): Promise<UserExport>
}

export function exportRepository(db: Executor): ExportRepository {
  return {
    async forUser(user) {
      const [account] = await db
        .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, user.id))
      const horseRows = await db
        .select()
        .from(horses)
        .where(
          exists(
            db
              .select()
              .from(horseMembers)
              .where(and(eq(horseMembers.horseId, horses.id), eq(horseMembers.userId, user.id))),
          ),
        )
        .orderBy(asc(horses.createdAt))
      const ids = horseRows.map((h) => h.id)
      const [analysisRows, planRows, usage] = await Promise.all([
        ids.length
          ? db.select().from(analyses).where(inArray(analyses.horseId, ids)).orderBy(asc(analyses.createdAt))
          : [],
        ids.length
          ? db
              .select({ plan: plans, explanation: planExplanations })
              .from(plans)
              .leftJoin(planExplanations, eq(planExplanations.planId, plans.id))
              .where(inArray(plans.horseId, ids))
              .orderBy(asc(plans.createdAt))
          : [],
        db.select().from(aiUsage).where(eq(aiUsage.userId, user.id)).orderBy(asc(aiUsage.createdAt)),
      ])
      return {
        account: { ...account, createdAt: account.createdAt.toISOString() },
        horses: horseRows.map((row) => ({
          horse: toHorse(row),
          analyses: analysisRows.filter((a) => a.horseId === row.id).map(toAnalysis),
          reports: analysisRows.flatMap((a) =>
            a.horseId === row.id && a.fileKey && a.mediaType
              ? [{ analysisId: a.id, key: a.fileKey, mediaType: a.mediaType }]
              : [],
          ),
          plans: planRows
            .filter((p) => p.plan.horseId === row.id)
            .map(({ plan, explanation }) => ({
              ...toPlan(plan),
              explanation: explanation
                ? { text: explanation.text, createdAt: explanation.createdAt.toISOString() }
                : null,
            })),
        })),
        aiUsage: usage.map((u) => ({
          route: u.route,
          model: u.model,
          status: u.status,
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          costSek: u.costSek,
          createdAt: u.createdAt.toISOString(),
        })),
      }
    },
  }
}
