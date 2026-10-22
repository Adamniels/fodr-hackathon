// Accounts made outside the sign-up flow: the seed's demo account (#29). The same rows Better Auth writes for an email
// and password sign-up (ADR 0009): a user, verified, and a credential account holding the scrypt hash of the password.
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { and, eq } from 'drizzle-orm'
import { TERMS_VERSION } from '@fodr/contracts/terms'
import type { Executor } from '../db'
import { accounts, users } from '../db/schema'

/** Why an existing account was not taken for the seed: it is someone's, as far as the seed can tell. */
export type SeedRefusal = 'other_password' | 'no_password' | 'unverified'

export class SeedAccountRefused extends Error {
  readonly reason: SeedRefusal

  constructor(reason: SeedRefusal) {
    super(`The account exists and is not the seed's (${reason})`)
    this.name = 'SeedAccountRefused'
    this.reason = reason
  }
}

export interface AccountRepository {
  /**
   * The seed's account: created verified with this password when the email is free, or the existing one when it is
   * verified and already has this password. Any other existing account is refused (SeedAccountRefused), so the seed
   * never adds horses to a real user's account or leaves an account the seed's password cannot open.
   */
  ensureSeedUser(email: string, name: string, password: string): Promise<{ id: string; created: boolean }>
  /**
   * Gives the account the role (#36): only an existing account whose email is verified, so an admin is always someone
   * who proved the address. The CLI's only call (admin-cli.ts).
   */
  setRole(email: string, role: 'user' | 'admin'): Promise<'ok' | 'not_found' | 'unverified'>
  /** The user accepts the current beta terms (#42). */
  acceptTerms(userId: string): Promise<void>
}

export function accountRepository(db: Executor): AccountRepository {
  return {
    async acceptTerms(userId) {
      await db
        .update(users)
        .set({ termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() })
        .where(eq(users.id, userId))
    },

    async setRole(email, role) {
      const account = (
        await db
          .select({ id: users.id, emailVerified: users.emailVerified })
          .from(users)
          .where(eq(users.email, email.trim().toLowerCase()))
      ).at(0)
      if (!account) return 'not_found'
      if (!account.emailVerified) return 'unverified'
      await db.update(users).set({ role }).where(eq(users.id, account.id))
      return 'ok'
    },

    async ensureSeedUser(email, name, password) {
      const normalised = email.trim().toLowerCase()
      const [existing] = await db
        .select({ id: users.id, emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.email, normalised))
      if (existing as typeof existing | undefined) {
        const [credential] = await db
          .select({ password: accounts.password })
          .from(accounts)
          .where(and(eq(accounts.userId, existing.id), eq(accounts.providerId, 'credential')))
        const hash = (credential as typeof credential | undefined)?.password
        if (!hash) throw new SeedAccountRefused('no_password')
        if (!(await verifyPassword({ hash, password }))) throw new SeedAccountRefused('other_password')
        if (!existing.emailVerified) throw new SeedAccountRefused('unverified')
        return { id: existing.id, created: false }
      }
      const [user] = await db
        .insert(users)
        // The demo account accepts the current terms, so the seed's user is not asked to (#42).
        .values({
          name,
          email: normalised,
          emailVerified: true,
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: new Date(),
        })
        .returning({ id: users.id })
      const hashed = await hashPassword(password)
      await db
        .insert(accounts)
        .values({ accountId: user.id, providerId: 'credential', userId: user.id, password: hashed })
      return { id: user.id, created: true }
    },
  }
}
