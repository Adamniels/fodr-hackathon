// `npm run seed` (and `node apps/api/dist/seed.mjs` in the image): creates the demo account with Sixten and Pysen
// (seed.ts). SEED_EMAIL and SEED_PASSWORD name the account; SEED_NAME its name; SEED_TODAY pins the day the journal
// counts back from (tests), otherwise today in Sweden. Prints what it did, never the password, and on a failure only
// the kind of error: a query error's message holds its parameters (the password hash, health notes).
import { z } from 'zod'
import { createDatabase } from './db'
import { SeedAccountRefused } from './repositories/accounts'
import { seedDemo } from './seed'

// The password .env.example ships with: fine in development, never anywhere the account can be reached by others.
const EXAMPLE_PASSWORD = 'demo-losenord-123'

const Env = z
  .object({
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }),
    SEED_EMAIL: z.email({ error: 'must be an email address' }),
    SEED_PASSWORD: z.string({ error: 'is required' }).min(12, { error: 'must be at least 12 characters' }),
    // As a sign-up's name: not only spaces, at most 100 characters (auth.ts).
    SEED_NAME: z.string().trim().min(1).max(100).default('Demo'),
    SEED_TODAY: z.iso.date({ error: 'must be a date, YYYY-MM-DD' }).optional(),
    NODE_ENV: z.string().optional(),
  })
  .refine((env) => !(env.NODE_ENV === 'production' && env.SEED_PASSWORD === EXAMPLE_PASSWORD), {
    path: ['SEED_PASSWORD'],
    message: 'is the example password from .env.example; pick a fresh one in production',
  })

// An empty value (`SEED_NAME=` in .env) means unset, as in config.ts.
const present = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''))
const parsed = Env.safeParse(present)
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')} ${i.message}`)
  process.stderr.write(['Invalid seed configuration:', ...issues].join('\n') + '\n')
  process.exit(1)
}
const env = parsed.data
const today = env.SEED_TODAY ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })

const REFUSALS = {
  other_password: 'it has another password, so it is not the seed account',
  no_password: 'it has no password login, so it is not the seed account',
  unverified: 'its email is not verified',
} as const

const database = createDatabase(env.DATABASE_URL)
let exitCode = 0
try {
  const result = await seedDemo(database.db, {
    email: env.SEED_EMAIL,
    password: env.SEED_PASSWORD,
    name: env.SEED_NAME,
    today,
  })
  const horses = result.horsesCreated.length ? result.horsesCreated.join(', ') : 'none (already there)'
  process.stdout.write(
    `Demo account ${env.SEED_EMAIL} ${result.accountCreated ? 'created' : 'already existed'}; horses created: ${horses}.\n`,
  )
} catch (e) {
  exitCode = 1
  if (e instanceof SeedAccountRefused) {
    process.stderr.write(
      `Not seeded: an account ${env.SEED_EMAIL} exists, and ${REFUSALS[e.reason]}. Nothing changed.\n`,
    )
  } else {
    // The class and the database's error code only, never the message (see above).
    const code = (e as { cause?: { code?: string }; code?: string }).cause?.code ?? (e as { code?: string }).code
    const kind = e instanceof Error ? e.constructor.name : typeof e
    process.stderr.write(`Seeding failed (${kind}${code ? `, ${code}` : ''}). Nothing changed.\n`)
  }
} finally {
  await database.close()
}
process.exit(exitCode)
