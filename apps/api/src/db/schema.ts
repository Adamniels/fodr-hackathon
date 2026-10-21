// The Drizzle schema (ADR 0008). `npm run db:generate` turns changes into a migration in drizzle/, reviewed in the PR.
//
// Auth tables (ADR 0009): owned by Better Auth, which reads and writes them through its Drizzle adapter (auth.ts).
// They follow its core schema for Postgres with UUID IDs (Better Auth 1.7.7, @better-auth/drizzle-adapter's
// generator), with plural snake_case names as ADR 0008 lists them. The property names are Better Auth's field names
// and must stay as they are; our own tables reference users.id. Timestamps are timestamptz, unlike the generator's
// plain timestamp: pg reads a plain timestamp in the process's time zone, which would shift expiry times whenever the
// server and the database disagree on it.
import type { HorseProfile } from '@fodr/contracts/horses'
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

const id = () => uuid('id').defaultRandom().primaryKey()
const instant = (name: string) => timestamp(name, { withTimezone: true })
const createdAt = () => instant('created_at').defaultNow().notNull()
const updatedAt = () =>
  instant('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull()

export const users = pgTable('users', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    expiresAt: instant('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
)

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: instant('access_token_expires_at'),
    refreshTokenExpiresAt: instant('refresh_token_expires_at'),
    scope: text('scope'),
    // A scrypt hash (Better Auth's default), never the password.
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
)

// Email verification, password reset and magic link tokens.
export const verifications = pgTable(
  'verifications',
  {
    id: id(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: instant('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
)

// Better Auth's rate limiter in the database, so limits survive a restart and hold across instances.
export const rateLimits = pgTable('rate_limits', {
  id: id(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
})

// Horses (#24, CF2, ADR 0008). The name is a column, for listing; the rest of the profile is jsonb, validated by the
// contract on the way in. Deleting a horse deletes it outright, with everything that references it (owner, #24).
export const horses = pgTable('horses', {
  id: id(),
  name: text('name').notNull(),
  profile: jsonb('profile').$type<Omit<HorseProfile, 'namn'>>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// Who may reach a horse. Every repository query goes through this table (ADR 0010); 'owner' is the only role until
// sharing (spec 6.3), which adds roles here without migrating the horses.
export const horseMembers = pgTable(
  'horse_members',
  {
    horseId: uuid('horse_id')
      .notNull()
      .references(() => horses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner'] }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.horseId, table.userId] }),
    index('horse_members_user_id_idx').on(table.userId),
  ],
)
