// All configuration comes from environment variables, parsed once at startup (ADR 0015). A missing or invalid value
// stops the process with a message naming every bad variable; values are never echoed, since some are secrets.
import { z } from 'zod'

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

const required = (rule: string) => (issue: { input: unknown }) =>
  issue.input === undefined ? 'is required' : `must be ${rule}`

const DATABASE_URL = z.url({ protocol: /^postgres(ql)?$/, error: required('a postgres:// URL') })

// A string first, so a missing price says "is required" (as SMTP_PORT); Number() then turns text into NaN, which fails.
const price = z
  .string({ error: required('a price in SEK') })
  .transform(Number)
  .pipe(z.number({ error: 'must be a price in SEK' }).nonnegative({ error: 'must not be negative' }))

const EnvSchema = z.object({
  DATABASE_URL,
  PORT: z.coerce
    .number({ error: required('a port number') })
    .int({ error: required('a port number') })
    .min(0, { error: required('a port number') })
    .max(65535, { error: required('a port number') })
    .default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS, { error: required(`one of ${LOG_LEVELS.join(', ')}`) }).default('info'),
  // The built web app (apps/web/dist). When set, the API serves it on the same origin; unset in development, where
  // Vite serves the web app and proxies /api here.
  WEB_DIST_DIR: z.string().optional(),
  // The build the API runs (its git commit), recorded with every saved plan (CF5, #27). Set by the image from its build
  // argument, never by hand; `dev` when the API runs from source.
  APP_VERSION: z.string().default('dev'),
  // Optional: without it the AI routes answer with the missing-key error and everything else works.
  ANTHROPIC_API_KEY: z.string().optional(),
  // The model, the daily AI calls per user and the prices that estimate each call's cost (#31, ADR 0015). The prices are
  // SEK per million tokens, from the provider's price list at the current exchange rate; no default, so nobody runs on
  // a made-up price.
  AI_MODEL: z.string().min(1).default('claude-sonnet-5-5'),
  AI_DAILY_CALLS_PER_USER: z.coerce
    .number({ error: required('a whole number') })
    .int({ error: required('a whole number') })
    .min(1, { error: 'must be at least 1' })
    .default(30),
  AI_PRICE_SEK_PER_MTOK_INPUT: price,
  AI_PRICE_SEK_PER_MTOK_OUTPUT: price,
  // Auth (ADR 0009): signs session cookies and tokens; the public address of the app, which the emailed links use
  // and whose origin is the only trusted one (in development the Vite address, which proxies /api).
  BETTER_AUTH_SECRET: z.string({ error: required('a secret') }).min(32, { error: 'must be at least 32 characters' }),
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/, error: required('an http:// or https:// URL') }),
  // Outgoing mail over SMTP (ADR 0005): Mailpit locally (ADR 0006), the email provider in production.
  SMTP_HOST: z.string({ error: required('a host name') }),
  // A string first, so a missing port says "is required"; Number() then turns text into NaN, which fails the check.
  SMTP_PORT: z
    .string({ error: required('a port number') })
    .transform(Number)
    .pipe(
      z
        .number({ error: 'must be a port number' })
        .int({ error: 'must be a port number' })
        .min(1, { error: 'must be a port number' })
        .max(65535, { error: 'must be a port number' }),
    ),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string({ error: required('a sender, such as Fodr <no-reply@example.se>') }),
  // The header a trusted proxy in front of the API sets to the client's IP (the host's, chosen in M5), which the auth
  // rate limits key on. Unset, the API is reached directly and the connection's own address is used instead; a header
  // the client sends itself is never trusted.
  CLIENT_IP_HEADER: z
    .string()
    .transform((name) => name.toLowerCase())
    .optional(),
  // The private bucket for uploaded reports (ADR 0011), through any S3 compatible store: SeaweedFS locally (ADR 0006).
  S3_ENDPOINT: z.url({ protocol: /^https?$/, error: required('an http:// or https:// URL') }),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string({ error: required('a bucket name') }),
  S3_ACCESS_KEY_ID: z.string({ error: required('an access key ID') }),
  S3_SECRET_ACCESS_KEY: z.string({ error: required('a secret') }),
  // Whether the API creates a missing bucket at start: for a local or test store. Production provisions its own bucket,
  // with its settings, so a wrong name fails loudly rather than creating an empty bucket.
  S3_CREATE_BUCKET: z
    .enum(['true', 'false'], { error: 'must be true or false' })
    .default('false')
    .transform((v) => v === 'true'),
})

export interface Config {
  databaseUrl: string
  port: number
  logLevel: (typeof LOG_LEVELS)[number]
  webDistDir: string | undefined
  appVersion: string
  anthropicApiKey: string | undefined
  ai: { model: string; dailyCallsPerUser: number; priceSekPerMtokInput: number; priceSekPerMtokOutput: number }
  betterAuthSecret: string
  betterAuthUrl: string
  smtpHost: string
  smtpPort: number
  smtpUser: string | undefined
  smtpPassword: string | undefined
  mailFrom: string
  clientIpHeader: string | undefined
  s3: {
    endpoint: string
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    createBucket: boolean
  }
}

export type ConfigResult = { ok: true; config: Config } | { ok: false; message: string }

// An empty value (`PORT=` in .env) means unset, not "" or 0.
const present = (env: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''))

const invalid = (error: z.ZodError) =>
  ['Invalid configuration:', ...error.issues.map((issue) => `  ${issue.path.join('.')} ${issue.message}`)].join('\n')

export function parseConfig(env: Record<string, string | undefined>): ConfigResult {
  const result = EnvSchema.safeParse(present(env))
  if (!result.success) return { ok: false, message: invalid(result.error) }
  const parsed = result.data
  return {
    ok: true,
    config: {
      databaseUrl: parsed.DATABASE_URL,
      port: parsed.PORT,
      logLevel: parsed.LOG_LEVEL,
      webDistDir: parsed.WEB_DIST_DIR,
      appVersion: parsed.APP_VERSION,
      anthropicApiKey: parsed.ANTHROPIC_API_KEY,
      ai: {
        model: parsed.AI_MODEL,
        dailyCallsPerUser: parsed.AI_DAILY_CALLS_PER_USER,
        priceSekPerMtokInput: parsed.AI_PRICE_SEK_PER_MTOK_INPUT,
        priceSekPerMtokOutput: parsed.AI_PRICE_SEK_PER_MTOK_OUTPUT,
      },
      betterAuthSecret: parsed.BETTER_AUTH_SECRET,
      betterAuthUrl: parsed.BETTER_AUTH_URL,
      smtpHost: parsed.SMTP_HOST,
      smtpPort: parsed.SMTP_PORT,
      smtpUser: parsed.SMTP_USER,
      smtpPassword: parsed.SMTP_PASSWORD,
      mailFrom: parsed.MAIL_FROM,
      clientIpHeader: parsed.CLIENT_IP_HEADER,
      s3: {
        endpoint: parsed.S3_ENDPOINT,
        region: parsed.S3_REGION,
        bucket: parsed.S3_BUCKET,
        accessKeyId: parsed.S3_ACCESS_KEY_ID,
        secretAccessKey: parsed.S3_SECRET_ACCESS_KEY,
        createBucket: parsed.S3_CREATE_BUCKET,
      },
    },
  }
}

/** The migrator's configuration (migrate.ts): the database alone, so a release migration needs no other secret. */
export function parseMigrationConfig(
  env: Record<string, string | undefined>,
): { ok: true; config: { databaseUrl: string } } | { ok: false; message: string } {
  const result = z.object({ DATABASE_URL }).safeParse(present(env))
  if (!result.success) return { ok: false, message: invalid(result.error) }
  return { ok: true, config: { databaseUrl: result.data.DATABASE_URL } }
}
