// Horses, always for a user (ADR 0010): every query is scoped through horse_members, so a handler cannot reach a horse
// the user is not a member of. A horse that does not exist and one that is not the user's are the same: undefined,
// which the routes answer with 404, so IDs cannot be probed.
import { HorseSchema, type Horse, type HorseProfile } from '@fodr/contracts/horses'
import type { User } from '@fodr/contracts/me'
import { and, asc, eq, exists, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { horseMembers, horses } from '../db/schema'

// Postgres refuses a malformed UUID with an error; it can only be an ID that names no horse.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Row = typeof horses.$inferSelect

// The server's ID and name last, so nothing stored in the jsonb can replace them; parsed on the way out too, since jsonb
// is only as safe as its schema (ADR 0008).
const toHorse = (row: Row): Horse => HorseSchema.parse({ ...row.profile, id: row.id, namn: row.name })
const toColumns = ({ namn, ...profile }: HorseProfile) => ({ name: namn, profile })

export interface HorseRepository {
  listFor(user: Pick<User, 'id'>): Promise<Horse[]>
  get(user: Pick<User, 'id'>, id: string): Promise<Horse | undefined>
  create(user: Pick<User, 'id'>, profile: HorseProfile): Promise<Horse>
  update(user: Pick<User, 'id'>, id: string, profile: HorseProfile): Promise<Horse | undefined>
  remove(user: Pick<User, 'id'>, id: string): Promise<boolean>
}

export function horseRepository(db: Database['db']): HorseRepository {
  const isMember = (user: Pick<User, 'id'>) =>
    exists(
      db
        .select()
        .from(horseMembers)
        .where(and(eq(horseMembers.horseId, horses.id), eq(horseMembers.userId, user.id))),
    )

  return {
    async listFor(user) {
      const rows = await db.select().from(horses).where(isMember(user)).orderBy(asc(horses.createdAt), asc(horses.id))
      return rows.map(toHorse)
    },

    async get(user, id) {
      if (!UUID.test(id)) return undefined
      const rows = await db
        .select()
        .from(horses)
        .where(and(eq(horses.id, id), isMember(user)))
      return rows.map(toHorse).at(0)
    },

    async create(user, profile) {
      return db.transaction(async (tx) => {
        const [row] = await tx.insert(horses).values(toColumns(profile)).returning()
        await tx.insert(horseMembers).values({ horseId: row.id, userId: user.id, role: 'owner' })
        return toHorse(row)
      })
    },

    async update(user, id, profile) {
      if (!UUID.test(id)) return undefined
      const rows = await db
        .update(horses)
        // The database's clock, like created_at.
        .set({ ...toColumns(profile), updatedAt: sql`now()` })
        .where(and(eq(horses.id, id), isMember(user)))
        .returning()
      return rows.map(toHorse).at(0)
    },

    async remove(user, id) {
      if (!UUID.test(id)) return false
      const deleted = await db
        .delete(horses)
        .where(and(eq(horses.id, id), isMember(user)))
        .returning({ id: horses.id })
      return deleted.length > 0
    },
  }
}
