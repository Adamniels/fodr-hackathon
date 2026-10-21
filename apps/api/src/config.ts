// All configuration comes from environment variables, parsed once at startup (ADR 0015). A missing or invalid value
// stops the process with a message naming every bad variable; values are never echoed, since some are secrets.
import { z } from 'zod'

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

const required = (rule: string) => (issue: { input: unknown }) =>
  issue.input === undefined ? 'is required' : `must be ${rule}`

const EnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: required('a postgres:// URL') }),
  PORT: z.coerce
    .number({ error: required('a port number') })
    .int({ error: required('a port number') })
    .min(0, { error: required('a port number') })
    .max(65535, { error: required('a port number') })
    .default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS, { error: required(`one of ${LOG_LEVELS.join(', ')}`) }).default('info'),
  // The built web app (apps/web/dist). When set, the API serves it on the same origin; unset in development, where
  // Vite serves the web app and proxies /api/v1 here.
  WEB_DIST_DIR: z.string().optional(),
})

export interface Config {
  databaseUrl: string
  port: number
  logLevel: (typeof LOG_LEVELS)[number]
  webDistDir: string | undefined
}

export type ConfigResult = { ok: true; config: Config } | { ok: false; message: string }

export function parseConfig(env: Record<string, string | undefined>): ConfigResult {
  // An empty value (`PORT=` in .env) means unset, not "" or 0.
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''))
  const result = EnvSchema.safeParse(present)
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  ${issue.path.join('.')} ${issue.message}`)
    return { ok: false, message: ['Invalid configuration:', ...lines].join('\n') }
  }
  const { DATABASE_URL, PORT, LOG_LEVEL, WEB_DIST_DIR } = result.data
  return { ok: true, config: { databaseUrl: DATABASE_URL, port: PORT, logLevel: LOG_LEVEL, webDistDir: WEB_DIST_DIR } }
}
