// The Drizzle schema (ADR 0008). `npm run db:generate` turns changes into a migration in drizzle/, reviewed in the PR.
//
// Auth tables (ADR 0009): owned by Better Auth, which reads and writes them through its Drizzle adapter (auth.ts).
// They follow its core schema for Postgres with UUID IDs (Better Auth 1.7.7, @better-auth/drizzle-adapter's
// generator), with plural snake_case names as ADR 0008 lists them. The property names are Better Auth's field names
// and must stay as they are; our own tables reference users.id. Timestamps are timestamptz, unlike the generator's
// plain timestamp: pg reads a plain timestamp in the process's time zone, which would shift expiry times whenever the
// server and the database disagree on it.
import type { Values } from '@fodr/contracts/analyses'
import type { HorseProfile } from '@fodr/contracts/horses'
import type { Plan } from '@fodr/domain/plan'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

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

// Roughage analyses (#26, CF4, ADR 0008), each of one horse. `values` are what the plan uses (the converted analysis,
// corrected by the owner); `extracted` is the AI's reading as it came, kept for comparison and support. The original
// report is in the file store under `file_key`; an analysis without a file (an example) has none. The newest is
// current: at most one per horse, enforced by the partial unique index.
export const analyses = pgTable(
  'analyses',
  {
    id: id(),
    horseId: uuid('horse_id')
      .notNull()
      .references(() => horses.id, { onDelete: 'cascade' }),
    fileKey: text('file_key'),
    mediaType: text('media_type'),
    values: jsonb('values').$type<Values>().notNull(),
    extracted: jsonb('extracted').$type<{ anmarkningar: string[] } & Record<string, unknown>>(),
    isCurrent: boolean('is_current').notNull(),
    sampledOn: date('sampled_on', { mode: 'string' }),
    createdAt: createdAt(),
  },
  (table) => [
    index('analyses_horse_id_idx').on(table.horseId),
    uniqueIndex('analyses_one_current_per_horse')
      .on(table.horseId)
      .where(sql`${table.isCurrent}`),
  ],
)

// Saved plans (#27, CF5, ADR 0004, ADR 0008), computed by the server and never changed: what they were computed from
// (`inputs`), the plan (`result`), the build that computed it and the catalogue it chose from. They go with their
// horse and their analysis.
export const plans = pgTable(
  'plans',
  {
    id: id(),
    horseId: uuid('horse_id')
      .notNull()
      .references(() => horses.id, { onDelete: 'cascade' }),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    inputs: jsonb('inputs').$type<{ profil: Hastprofil; analys: Grovfoderanalys }>().notNull(),
    result: jsonb('result').$type<Plan>().notNull(),
    engineVersion: text('engine_version').notNull(),
    productSetVersion: text('product_set_version').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('plans_horse_id_created_at_idx').on(table.horseId, table.createdAt)],
)

// Journal entries (#28, CF7, ADR 0008): measurements and notes per horse over time. An entry made by saving a plan
// refers to it, and its snapshot is derived from that plan when read rather than stored twice. `created_at` orders
// entries on the same date.
export const journalEntries = pgTable(
  'journal_entries',
  {
    id: id(),
    horseId: uuid('horse_id')
      .notNull()
      .references(() => horses.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    weightKg: doublePrecision('weight_kg'),
    bodyCondition: integer('body_condition'),
    text: text('text').notNull(),
    planId: uuid('plan_id').references(() => plans.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [index('journal_entries_horse_id_date_idx').on(table.horseId, table.date, table.createdAt)],
)
