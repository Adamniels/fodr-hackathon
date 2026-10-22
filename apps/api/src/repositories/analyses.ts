// Analyses, always for a user (ADR 0010): every query goes through the horse's membership, so a handler cannot reach
// an analysis of a horse the user is not a member of. Not found and not the user's are the same: undefined (404).
import { AnalysisSchema, type Analysis, type Values } from '@fodr/contracts/analyses'
import type { User } from '@fodr/contracts/me'
import { and, eq, exists, isNotNull } from 'drizzle-orm'
import type { Database } from '../db'
import { analyses, horseMembers } from '../db/schema'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// A sampling date the database can store; anything else the AI read is kept in the values only.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

type Row = typeof analyses.$inferSelect

// Parsed on the way out, since jsonb is only as safe as its schema (ADR 0008).
const toAnalysis = (row: Row): Analysis =>
  AnalysisSchema.parse({
    ...row.values,
    id: row.id,
    anmarkningar: row.extracted?.anmarkningar ?? [],
    hasFile: row.fileKey !== null,
    createdAt: row.createdAt.toISOString(),
  })

export interface NewAnalysis {
  values: Values
  /** The report in the file store, or none for an analysis without a file. */
  file?: { key: string; mediaType: string }
  extracted?: { anmarkningar: string[] } & Record<string, unknown>
}

export interface AnalysisRepository {
  current(user: Pick<User, 'id'>, horseId: string): Promise<Analysis | null | undefined>
  /** Saves the analysis as the horse's current one; undefined when the horse is not the user's (or is gone). */
  create(user: Pick<User, 'id'>, horseId: string, analysis: NewAnalysis): Promise<Analysis | undefined>
  updateValues(
    user: Pick<User, 'id'>,
    horseId: string,
    analysisId: string,
    values: Values,
  ): Promise<Analysis | undefined>
  /** The keys of the horse's stored reports, to delete them with the horse. */
  fileKeys(user: Pick<User, 'id'>, horseId: string): Promise<string[]>
}

export function analysisRepository(db: Database['db']): AnalysisRepository {
  const isMember = (user: Pick<User, 'id'>, horseId: string) =>
    exists(
      db
        .select()
        .from(horseMembers)
        .where(and(eq(horseMembers.horseId, horseId), eq(horseMembers.userId, user.id))),
    )

  return {
    async current(user, horseId) {
      if (!UUID.test(horseId)) return undefined
      const members = await db
        .select({ horseId: horseMembers.horseId })
        .from(horseMembers)
        .where(and(eq(horseMembers.horseId, horseId), eq(horseMembers.userId, user.id)))
      if (members.length === 0) return undefined
      const rows = await db
        .select()
        .from(analyses)
        .where(and(eq(analyses.horseId, horseId), eq(analyses.isCurrent, true)))
      return rows.map(toAnalysis).at(0) ?? null
    },

    async create(user, horseId, analysis) {
      if (!UUID.test(horseId)) return undefined
      return db.transaction(async (tx) => {
        // Locks the membership row, so the horse cannot be deleted between this check and the insert.
        const members = await tx
          .select({ horseId: horseMembers.horseId })
          .from(horseMembers)
          .where(and(eq(horseMembers.horseId, horseId), eq(horseMembers.userId, user.id)))
          .for('share')
        if (members.length === 0) return undefined
        await tx
          .update(analyses)
          .set({ isCurrent: false })
          .where(and(eq(analyses.horseId, horseId), eq(analyses.isCurrent, true)))
        const provdatum = analysis.values.analys.provdatum
        const [row] = await tx
          .insert(analyses)
          .values({
            horseId,
            fileKey: analysis.file?.key ?? null,
            mediaType: analysis.file?.mediaType ?? null,
            values: analysis.values,
            extracted: analysis.extracted ?? null,
            isCurrent: true,
            sampledOn: provdatum && ISO_DATE.test(provdatum) && !Number.isNaN(Date.parse(provdatum)) ? provdatum : null,
          })
          .returning()
        return toAnalysis(row)
      })
    },

    async updateValues(user, horseId, analysisId, values) {
      if (!UUID.test(horseId) || !UUID.test(analysisId)) return undefined
      return db.transaction(async (tx) => {
        const row = (
          await tx
            .select()
            .from(analyses)
            .where(and(eq(analyses.id, analysisId), eq(analyses.horseId, horseId), isMember(user, horseId)))
            .for('update')
        ).at(0)
        if (!row) return undefined
        // A conversion the analysis never had cannot be claimed: only the stored ones may stay.
        const stored = new Set(row.values.omrakningar.map((o) => o.amne))
        const kept = { ...values, omrakningar: values.omrakningar.filter((o) => stored.has(o.amne)) }
        const [updated] = await tx.update(analyses).set({ values: kept }).where(eq(analyses.id, analysisId)).returning()
        return toAnalysis(updated)
      })
    },

    async fileKeys(user, horseId) {
      if (!UUID.test(horseId)) return []
      const rows = await db
        .select({ key: analyses.fileKey })
        .from(analyses)
        .where(and(eq(analyses.horseId, horseId), isNotNull(analyses.fileKey), isMember(user, horseId)))
      return rows.flatMap((r) => (r.key ? [r.key] : []))
    },
  }
}
