// Analyses, always for a user (ADR 0010): every query goes through the horse's membership, so a handler cannot reach
// an analysis of a horse the user is not a member of. Not found and not the user's are the same: undefined (404).
import { AnalysisSchema, type Analysis, type Values } from '@fodr/contracts/analyses'
import type { User } from '@fodr/contracts/me'
import { and, eq, exists } from 'drizzle-orm'
import type { Executor } from '../db'
import { analyses, horseMembers, horses } from '../db/schema'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// A sampling date the database can store; anything else the AI read is kept in the values only.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const sampledOn = (provdatum: string | undefined) =>
  provdatum && ISO_DATE.test(provdatum) && !Number.isNaN(Date.parse(provdatum)) ? provdatum : null

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
  /** One analysis of the horse; undefined when it is not the user's or not of this horse. */
  get(user: Pick<User, 'id'>, horseId: string, analysisId: string): Promise<Analysis | undefined>
  /** Saves the analysis as the horse's current one; undefined when the horse is not the user's (or is gone). */
  create(user: Pick<User, 'id'>, horseId: string, analysis: NewAnalysis): Promise<Analysis | undefined>
  updateValues(
    user: Pick<User, 'id'>,
    horseId: string,
    analysisId: string,
    values: Values,
  ): Promise<Analysis | undefined>
}

export function analysisRepository(db: Executor): AnalysisRepository {
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

    async get(user, horseId, analysisId) {
      if (!UUID.test(horseId) || !UUID.test(analysisId)) return undefined
      const rows = await db
        .select()
        .from(analyses)
        .where(and(eq(analyses.id, analysisId), eq(analyses.horseId, horseId), isMember(user, horseId)))
      return rows.map(toAnalysis).at(0)
    },

    async create(user, horseId, analysis) {
      if (!UUID.test(horseId)) return undefined
      return db.transaction(async (tx) => {
        // Locks the horse: two analyses created at once take turns, so the second sees the first as current and
        // demotes it, and a delete of the horse (horseRepository.remove, which takes the same lock) waits or is waited
        // for, so it always sees every file it must remove.
        const locked = await tx
          .select({ id: horses.id })
          .from(horses)
          .where(and(eq(horses.id, horseId), isMember(user, horseId)))
          .for('update')
        if (locked.length === 0) return undefined
        await tx
          .update(analyses)
          .set({ isCurrent: false })
          .where(and(eq(analyses.horseId, horseId), eq(analyses.isCurrent, true)))
        const [row] = await tx
          .insert(analyses)
          .values({
            horseId,
            fileKey: analysis.file?.key ?? null,
            mediaType: analysis.file?.mediaType ?? null,
            values: analysis.values,
            extracted: analysis.extracted ?? null,
            isCurrent: true,
            sampledOn: sampledOn(analysis.values.analys.provdatum),
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
        // A conversion is the server's: the client can only drop one (a value the owner typed over), never add one or
        // change what it says, so the stored entries it still names are kept as stored.
        const sent = new Set(values.omrakningar.map((o) => o.amne))
        const kept = { ...values, omrakningar: row.values.omrakningar.filter((o) => sent.has(o.amne)) }
        const [updated] = await tx
          .update(analyses)
          .set({ values: kept, sampledOn: sampledOn(kept.analys.provdatum) })
          .where(eq(analyses.id, analysisId))
          .returning()
        return toAnalysis(updated)
      })
    },
  }
}
