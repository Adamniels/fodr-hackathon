// The demo account (#29): `npm run seed` (seed-cli.ts) creates it in any environment, and the e2e tests seed one per
// test. Idempotent: an existing account is reused as it is, and each horse is created, with its analysis and journal,
// only when the account has no horse of that name, so seeding again duplicates and overwrites nothing.
import type { HorseProfile } from '@fodr/contracts/horses'
import type { Grovfoderanalys } from '@fodr/domain/types'
import type { AccountRepository } from './repositories/accounts'
import type { AnalysisRepository } from './repositories/analyses'
import type { HorseRepository } from './repositories/horses'
import type { JournalRepository } from './repositories/journal'
import { PYSEN, PYSEN_JOURNAL, SIXTEN, SIXTEN_ANALYSIS, SIXTEN_JOURNAL, type SeedEntry } from './seed-data'

export interface SeedRepositories {
  accounts: AccountRepository
  horses: HorseRepository
  analyses: AnalysisRepository
  journal: JournalRepository
}

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

export async function seedDemo(repos: SeedRepositories, options: SeedOptions): Promise<SeedResult> {
  const account = await repos.accounts.ensureVerifiedUser(options.email, options.name, options.password)
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
