// Authentication with Better Auth (ADR 0009, #22): sign up with email and password, email verification, login,
// logout, password reset and magic link. Mounted at /api/auth/* (app.ts); sessions are httpOnly, SameSite=Lax cookies,
// Secure when the app is served over https. The magic link plugin and no other: every plugin is attack surface.
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { TERMS_VERSION } from '@fodr/contracts/terms'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { magicLink } from 'better-auth/plugins'
import { eq, inArray, like, or } from 'drizzle-orm'
import type { Config } from './config'
import type { Database } from './db'
import * as schema from './db/schema'
import type { Logger } from './logger'
import type { Mailer } from './mail/mailer'
import {
  accountDeletedMail,
  accountExistsMail,
  magicLinkMail,
  resetPasswordMail,
  verificationMail,
} from './mail/templates'
import { horseRepository } from './repositories/horses'
import type { FileStore } from './storage'

export interface AuthDeps {
  config: Pick<Config, 'betterAuthSecret' | 'betterAuthUrl'>
  database: Database
  mailer: Mailer
  logger: Logger
  /** Where the reports of a deleted account's horses are removed from (#41). */
  files: FileStore
}

const MINUTE = 60
const MAX_NAME_LENGTH = 100

/**
 * The client's IP as the app resolved it (app.ts): from the trusted proxy header, or the connection. Better Auth reads
 * only this header, and the app always overwrites it, so a client cannot choose the IP its rate limits key on.
 */
export const CLIENT_IP_HEADER = 'x-fodr-client-ip'

export function createAuth({ config, database, mailer, logger, files }: AuthDeps) {
  // Work that touches mail runs without being awaited: a reply that waited for SMTP (or for looking up whether an
  // account exists) would take longer for some emails than others and so reveal which have accounts. A failure is
  // logged by its type only, without the address.
  const background = (task: () => Promise<unknown>) => {
    task().catch((err: unknown) => {
      logger.error(
        { errorType: err instanceof Error ? err.constructor.name : typeof err },
        'auth background task failed',
      )
    })
  }
  const horses = horseRepository(database.db)
  // A deleted account's pending links: a password reset's row holds the user's ID, a login link's the email (#41).
  // Matched exactly, as an email's underscore would be a wildcard in LIKE.
  const removePendingLinks = async (user: { id: string; email: string }) => {
    const rows = await database.db
      .select({ id: schema.verifications.id, value: schema.verifications.value })
      .from(schema.verifications)
      .where(
        or(
          eq(schema.verifications.value, user.id),
          like(schema.verifications.value, `%${user.email.replace(/[\\%_]/g, '\\$&')}%`),
        ),
      )
    const ids = rows.filter((r) => r.value === user.id || emailIn(r.value) === user.email).map((r) => r.id)
    if (ids.length > 0) await database.db.delete(schema.verifications).where(inArray(schema.verifications.id, ids))
  }
  const userByEmail = async (email: string) => {
    const [user] = await database.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1)
    return user as { id: string } | undefined
  }

  const auth = betterAuth({
    appName: 'Fodr',
    baseURL: config.betterAuthUrl,
    basePath: '/api/auth',
    secret: config.betterAuthSecret,
    // The app and the API share one origin (ADR 0005); no other site may send requests with the session cookie.
    trustedOrigins: [new URL(config.betterAuthUrl).origin],
    database: drizzleAdapter(database.db, { provider: 'pg', schema, usePlural: true }),
    advanced: {
      database: { generateId: 'uuid' },
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      // On everywhere: Better Auth skips its origin, CSRF and callback URL checks when NODE_ENV is test, so these
      // settings make the tests prove what production does, and a stray NODE_ENV can never switch them off.
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
    telemetry: { enabled: false },
    // The admin role (#36, CF9): in the session, so a request knows it without a query; `input: false`, so no sign-up
    // or profile update can set it. Only `npm run admin:grant` changes it (repositories/accounts.ts).
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'user', input: false },
        // The beta terms (#42): the version is sent at sign-up and must be the current one (the hook below); the time
        // is the server's. Neither can be changed through the profile update.
        termsVersion: { type: 'string', required: false, input: true },
        termsAcceptedAt: { type: 'date', required: false, input: false },
      },
      // Deleting an account (#41, CF8): at once, confirmed with the password (the hook below), everything of it removed
      // and a receipt emailed. The horses go first, through ownership, as deleting the user only removes the
      // membership; if the user's own deletion then failed, the account remains without its horses, and the user can
      // try again. The sessions, the login and the memberships go with the user row; the AI usage stays, anonymous (#31).
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          for (const id of await horses.ownedBy(user)) {
            const keys = (await horses.remove(user, id)) ?? []
            try {
              await files.remove(keys)
            } catch (err) {
              // Nothing refers to the files any more, and their keys hold no personal data: logged, to remove by hand.
              logger.error({ err, keys }, 'reports of a deleted account remain')
            }
          }
          await removePendingLinks(user)
        },
        afterDelete: (user) => {
          background(() => mailer.send(accountDeletedMail(user.email)))
          return Promise.resolve()
        },
      },
    },
    hooks: {
      // An account is only deleted with its password: Better Auth would otherwise delete it for a recent session alone.
      before: createAuthMiddleware((ctx) => {
        const fields = (ctx.body ?? {}) as Record<string, unknown>
        // Signing up accepts the current beta terms (#42); the profile update never changes which were accepted.
        if (ctx.path === '/sign-up/email' && fields.termsVersion !== TERMS_VERSION) {
          throw new APIError('BAD_REQUEST', { code: 'TERMS_NOT_ACCEPTED', message: 'Terms not accepted' })
        }
        if (ctx.path === '/update-user' && ('termsVersion' in fields || 'termsAcceptedAt' in fields)) {
          throw new APIError('BAD_REQUEST', { code: 'TERMS_READ_ONLY', message: 'Terms are accepted elsewhere' })
        }
        if (ctx.path !== '/delete-user') return Promise.resolve()
        const body = ctx.body as { password?: unknown } | undefined
        if (typeof body?.password !== 'string' || body.password === '') {
          throw new APIError('BAD_REQUEST', { code: 'PASSWORD_REQUIRED', message: 'Password required' })
        }
        return Promise.resolve()
      }),
    },
    // Its own log lines go to pino (ADR 0015), first line only, and never one about a query: those carry the SQL
    // parameters, which hold emails, password hashes or tokens. Its errors go through pino's error serializer.
    logger: {
      log: (level, message) => {
        const line = /query|params/i.test(message) ? 'database error (details withheld)' : message.split('\n')[0]
        logger[level]({ source: 'better-auth' }, line)
      },
    },
    onAPIError: { onError: (err) => logger.error({ source: 'better-auth', err }, 'auth error') },
    // Verification, password reset and magic link tokens are stored hashed, so a database leak opens no account.
    verification: { storeIdentifier: 'hashed' },
    databaseHooks: {
      user: {
        create: {
          // Codes the web app turns into text (i18n/auth.ts).
          before: (user) => {
            if (user.name.trim() === '')
              throw new APIError('BAD_REQUEST', { code: 'NAME_REQUIRED', message: 'Name required' })
            if (user.name.length > MAX_NAME_LENGTH) {
              throw new APIError('BAD_REQUEST', { code: 'NAME_TOO_LONG', message: 'Name too long' })
            }
            return Promise.resolve({ data: { ...user, termsAcceptedAt: new Date() } })
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      // CF1: the email is verified before the account can be used (owner, #22): no password login until then.
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => {
        background(() => mailer.send(resetPasswordMail(user.email, url)))
        return Promise.resolve()
      },
      // A sign up with an email that has an account replies as to a new one (no enumeration) and mails the mailbox
      // instead (owner, #22 review): a verified owner hears an account exists; an unverified account gets a link to
      // choose a password, which proves the mailbox, replaces a password someone else set and revokes their sessions.
      onExistingUserSignUp: ({ user }) => {
        if (user.emailVerified) {
          background(() => mailer.send(accountExistsMail(user.email, new URL('/login', config.betterAuthUrl).href)))
        } else {
          background(() =>
            auth.api.requestPasswordReset({ body: { email: user.email, redirectTo: '/reset-password' } }),
          )
        }
        return Promise.resolve()
      },
      // A used reset link proves the mailbox, as a verification link does.
      onPasswordReset: async ({ user }) => {
        await database.db.update(schema.users).set({ emailVerified: true }).where(eq(schema.users.id, user.id))
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) => {
        background(() => mailer.send(verificationMail(user.email, url)))
        return Promise.resolve()
      },
    },
    // Always on, also in development and tests (Better Auth enables it only in production by default), and in the
    // database, so limits survive a restart and hold across instances. Keyed on the client IP (CLIENT_IP_HEADER).
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: MINUTE,
      max: 100,
      customRules: {
        '/sign-in/email': { window: MINUTE, max: 5 },
        '/sign-up/email': { window: MINUTE, max: 5 },
        '/sign-in/magic-link': { window: MINUTE, max: 3 },
        '/request-password-reset': { window: MINUTE, max: 3 },
        // Deleting the account checks the password (#41): as few guesses as signing in.
        '/delete-user': { window: MINUTE, max: 5 },
      },
    },
    plugins: [
      magicLink({
        // Login only (owner, #22): sign-up stays email and password with a verified email, so there is one sign-up path.
        // The reply is the same either way; a link only goes to an email that has an account.
        disableSignUp: true,
        sendMagicLink: ({ email, url }) => {
          background(async () => {
            if (await userByEmail(email)) await mailer.send(magicLinkMail(email, url))
          })
          return Promise.resolve()
        },
      }),
    ],
  })
  return auth
}

export type Auth = ReturnType<typeof createAuth>

/** The email in a verification row's JSON value (a login link's), or undefined. */
function emailIn(value: string): string | undefined {
  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === 'object' && parsed !== null && 'email' in parsed && typeof parsed.email === 'string'
      ? parsed.email
      : undefined
  } catch {
    return undefined
  }
}
