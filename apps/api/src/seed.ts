// The demo account (#29): `npm run seed` (seed-cli.ts) creates it in any environment, and the e2e tests seed one per
// test. Idempotent: the account is the seed's own (created now, or found verified with the seed's password; any other
// account is refused, accounts.ts), and each horse is created, with its analysis and journal, only when the account has
// no horse of that name. The whole seed is one transaction under a lock on the email, so a failed run leaves nothing
// half made and two runs at once take turns.
import type { HorseProfile } from '@fodr/contracts/horses'
import type { Grovfoderanalys } from '@fodr/domain/types'
import { sql } from 'drizzle-orm'
import type { Executor } from './db'
import { accountRepository } from './repositories/accounts'
import { analysisRepository } from './repositories/analyses'
import { horseRepository } from './repositories/horses'
import { journalRepository } from './repositories/journal'
import { PYSEN, PYSEN_JOURNAL, SIXTEN, SIXTEN_ANALYSIS, SIXTEN_JOURNAL, type SeedEntry } from './seed-data'

export interface SeedOptions {
  email: string
  password: string
  name: string
  /** The calendar day the journal dates count back from (YYYY-MM-DD). */
  today: string
}

export interface SeedResult {
  userId: string
  accountCreated: boolean
  /** The horses created this time; empty when the account already had them. */
  horsesCreated: string[]
}

/** The date `days` calendar days before `today` (both YYYY-MM-DD), counted in UTC so no clock change shifts it. */
export function daysBefore(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

export function seedDemo(db: Executor, options: SeedOptions): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${options.email.trim().toLowerCase()}))`)
    return seedIn(tx, options)
  })
}

async function seedIn(db: Executor, options: SeedOptions): Promise<SeedResult> {
  const repos = {
    accounts: accountRepository(db),
    horses: horseRepository(db),
    analyses: analysisRepository(db),
    journal: journalRepository(db),
  }
  const account = await repos.accounts.ensureSeedUser(options.email, options.name, options.password)
  const user = { id: account.id }
  const existing = new Set((await repos.horses.listFor(user)).map((h) => h.namn))
  const horsesCreated: string[] = []

  const seedHorse = async (profile: HorseProfile, journal: SeedEntry[], analys?: Grovfoderanalys) => {
    if (existing.has(profile.namn)) return
    const horse = await repos.horses.create(user, profile)
    if (analys) await repos.analyses.create(user, horse.id, { values: { analys, omrakningar: [] } })
    for (const entry of journal) {
      await repos.journal.create(user, horse.id, {
        datum: daysBefore(options.today, entry.daysAgo),
        viktKg: entry.viktKg,
        hull: entry.hull,
        text: entry.text,
      })
    }
    horsesCreated.push(profile.namn)
  }

  await seedHorse(SIXTEN, SIXTEN_JOURNAL, SIXTEN_ANALYSIS)
  await seedHorse(PYSEN, PYSEN_JOURNAL)
  return { userId: account.id, accountCreated: account.created, horsesCreated }
}
