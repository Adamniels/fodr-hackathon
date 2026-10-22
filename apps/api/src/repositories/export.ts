// Everything the app holds about a user, for their export (#40, CF8), always for the user (ADR 0010): their account and
// signed-in devices, the horses they are a member of with each horse's analyses (the AI's reading included, and where
// its report is stored), saved plans with their explanations and the journal, and their AI usage. Read in one
// repeatable-read transaction, so the files agree with each other (a journal entry's plan is in plans.json). When
// sharing arrives, a member's export holds the shared horse's data too: the sharing ticket decides whether to filter by
// role. Never the password, tokens or another user's account.
import type { Analysis } from '@fodr/contracts/analyses'
import type { Horse } from '@fodr/contracts/horses'
import type { JournalEntry } from '@fodr/contracts/journal'
import type { User } from '@fodr/contracts/me'
import type { SavedPlan } from '@fodr/contracts/plans'
import { and, asc, eq, exists, inArray } from 'drizzle-orm'
import type { Executor } from '../db'
import { aiUsage, analyses, horseMembers, horses, planExplanations, plans, sessions, users } from '../db/schema'
import { toAnalysis } from './analyses'
import { toHorse } from './horses'
import { journalRepository } from './journal'
import { toPlan } from './plans'

export interface ExportedHorse {
  horse: Horse
  analyses: (Analysis & { extracted: Record<string, unknown> | null })[]
  /** The uploaded reports in the file store, by analysis. */
  reports: { analysisId: string; key: string; mediaType: string }[]
  plans: (SavedPlan & { explanation: { text: string; model: string; createdAt: string } | null })[]
  journal: JournalEntry[]
}

export interface UserExport {
  account: {
    id: string
    name: string
    email: string
    emailVerified: boolean
    role: string
    createdAt: string
    updatedAt: string
  }
  sessions: { createdAt: string; expiresAt: string; ipAddress: string | null; userAgent: string | null }[]
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
  /** The user's data; undefined when the account is gone (deleted during the request). */
  forUser(user: Pick<User, 'id'>): Promise<UserExport | undefined>
}

export function exportRepository(db: Executor): ExportRepository {
  return {
    forUser(user) {
      return db.transaction(
        async (tx) => {
          const account = (
            await tx
              .select({
                id: users.id,
                name: users.name,
                email: users.email,
                emailVerified: users.emailVerified,
                role: users.role,
                createdAt: users.createdAt,
                updatedAt: users.updatedAt,
              })
              .from(users)
              .where(eq(users.id, user.id))
          ).at(0)
          if (!account) return undefined
          const horseRows = await tx
            .select()
            .from(horses)
            .where(
              exists(
                tx
                  .select()
                  .from(horseMembers)
                  .where(and(eq(horseMembers.horseId, horses.id), eq(horseMembers.userId, user.id))),
              ),
            )
            .orderBy(asc(horses.createdAt))
          const ids = horseRows.map((h) => h.id)
          const [analysisRows, planRows, usage, sessionRows] = await Promise.all([
            ids.length
              ? tx.select().from(analyses).where(inArray(analyses.horseId, ids)).orderBy(asc(analyses.createdAt))
              : [],
            ids.length
              ? tx
                  .select({ plan: plans, explanation: planExplanations })
                  .from(plans)
                  .leftJoin(planExplanations, eq(planExplanations.planId, plans.id))
                  .where(inArray(plans.horseId, ids))
                  .orderBy(asc(plans.createdAt))
              : [],
            tx.select().from(aiUsage).where(eq(aiUsage.userId, user.id)).orderBy(asc(aiUsage.createdAt)),
            tx
              .select({
                createdAt: sessions.createdAt,
                expiresAt: sessions.expiresAt,
                ipAddress: sessions.ipAddress,
                userAgent: sessions.userAgent,
              })
              .from(sessions)
              .where(eq(sessions.userId, user.id))
              .orderBy(asc(sessions.createdAt)),
          ])
          const journal = journalRepository(tx)
          const exported: ExportedHorse[] = []
          for (const row of horseRows) {
            exported.push({
              horse: toHorse(row),
              analyses: analysisRows
                .filter((a) => a.horseId === row.id)
                .map((a) => ({ ...toAnalysis(a), extracted: a.extracted ?? null })),
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
                    ? {
                        text: explanation.text,
                        model: explanation.model,
                        createdAt: explanation.createdAt.toISOString(),
                      }
                    : null,
                })),
              journal: (await journal.list(user, row.id)) ?? [],
            })
          }
          return {
            account: {
              ...account,
              createdAt: account.createdAt.toISOString(),
              updatedAt: account.updatedAt.toISOString(),
            },
            sessions: sessionRows.map((s) => ({
              ...s,
              createdAt: s.createdAt.toISOString(),
              expiresAt: s.expiresAt.toISOString(),
            })),
            horses: exported,
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
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      )
    },
  }
}
