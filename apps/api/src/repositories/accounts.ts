// Accounts made outside the sign-up flow: the seed's demo account (#29). The same rows Better Auth writes for an email
// and password sign-up (ADR 0009): a user, verified, and a credential account holding the scrypt hash of the password.
import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import type { Database } from '../db'
import { accounts, users } from '../db/schema'

export interface AccountRepository {
  /** The user with this email, created verified with this password when there is none; an existing one is kept as it is. */
  ensureVerifiedUser(email: string, name: string, password: string): Promise<{ id: string; created: boolean }>
}

export function accountRepository(db: Database['db']): AccountRepository {
  return {
    async ensureVerifiedUser(email, name, password) {
      const normalised = email.trim().toLowerCase()
      const hash = await hashPassword(password)
      return db.transaction(async (tx) => {
        const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, normalised))
        if (existing as typeof existing | undefined) return { id: existing.id, created: false }
        const [user] = await tx
          .insert(users)
          .values({ name, email: normalised, emailVerified: true })
          .returning({ id: users.id })
        await tx
          .insert(accounts)
          .values({ accountId: user.id, providerId: 'credential', userId: user.id, password: hash })
        return { id: user.id, created: true }
      })
    },
  }
}
