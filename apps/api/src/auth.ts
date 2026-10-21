// Authentication with Better Auth (ADR 0009, #22): sign up with email and password, email verification, login,
// logout, password reset and magic link. Mounted at /api/auth/* (app.ts); sessions are httpOnly, SameSite=Lax cookies,
// Secure when the app is served over https. The magic link plugin and no other: every plugin is attack surface.
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { magicLink } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import type { Config } from './config'
import type { Database } from './db'
import * as schema from './db/schema'
import type { Logger } from './logger'
import type { Mailer } from './mail/mailer'
import { accountExistsMail, magicLinkMail, resetPasswordMail, verificationMail } from './mail/templates'

export interface AuthDeps {
  config: Pick<Config, 'betterAuthSecret' | 'betterAuthUrl'>
  database: Database
  mailer: Mailer
  logger: Logger
}

const MINUTE = 60
const MAX_NAME_LENGTH = 100

/**
 * The client's IP as the app resolved it (app.ts): from the trusted proxy header, or the connection. Better Auth reads
 * only this header, and the app always overwrites it, so a client cannot choose the IP its rate limits key on.
 */
export const CLIENT_IP_HEADER = 'x-fodr-client-ip'

export function createAuth({ config, database, mailer, logger }: AuthDeps) {
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
          before: (user) => {
            if (user.name.length > MAX_NAME_LENGTH) throw new APIError('BAD_REQUEST', { message: 'Name too long' })
            return Promise.resolve({ data: user })
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
      },
    },
    plugins: [
      magicLink({
        // Login only (owner, #22): sign up stays email and password, so M5's invite-only sign up has one door. The
        // reply is the same either way; a link only goes to an email that has an account.
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
