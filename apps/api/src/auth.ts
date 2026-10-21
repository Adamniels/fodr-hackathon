// Authentication with Better Auth (ADR 0009, #22): sign up with email and password, email verification, login,
// logout, password reset and magic link. Mounted at /api/auth/* (app.ts); sessions are httpOnly, SameSite=Lax cookies,
// Secure when the app is served over https. The magic link plugin and no other: every plugin is attack surface.
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins'
import type { Config } from './config'
import type { Database } from './db'
import * as schema from './db/schema'
import type { Logger } from './logger'
import type { Mail, Mailer } from './mail/mailer'
import { magicLinkMail, resetPasswordMail, verificationMail } from './mail/templates'

export interface AuthDeps {
  config: Pick<Config, 'betterAuthSecret' | 'betterAuthUrl'>
  database: Database
  mailer: Mailer
  logger: Logger
}

const MINUTE = 60

/**
 * The client's IP as the app resolved it (app.ts): from the trusted proxy header, or the connection. Better Auth reads
 * only this header, and the app always overwrites it, so a client cannot choose the IP its rate limits key on.
 */
export const CLIENT_IP_HEADER = 'x-fodr-client-ip'

export function createAuth({ config, database, mailer, logger }: AuthDeps) {
  // Mail goes out without being awaited: a reply that waited for SMTP would take longer for an existing account than
  // for an unknown email, and so reveal which addresses have accounts. A failure is logged without the address.
  const send = (mail: Mail) => {
    mailer.send(mail).catch((err: unknown) => {
      logger.error({ errorType: err instanceof Error ? err.constructor.name : typeof err }, 'mail not sent')
    })
  }

  return betterAuth({
    appName: 'Fodr',
    baseURL: config.betterAuthUrl,
    basePath: '/api/auth',
    secret: config.betterAuthSecret,
    // The app and the API share one origin (ADR 0005); no other site may send requests with the session cookie.
    trustedOrigins: [new URL(config.betterAuthUrl).origin],
    database: drizzleAdapter(database.db, { provider: 'pg', schema, usePlural: true }),
    advanced: { database: { generateId: 'uuid' }, ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      // CF1: the email is verified before the account can be used (owner, #22): no password login until then.
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => {
        send(resetPasswordMail(user.email, user.name, url))
        return Promise.resolve()
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) => {
        send(verificationMail(user.email, user.name, url))
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
        // Login only (owner, #22): sign up stays email and password, so M5's invite-only sign up has one door.
        disableSignUp: true,
        sendMagicLink: ({ email, url }) => {
          send(magicLinkMail(email, url))
          return Promise.resolve()
        },
      }),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
