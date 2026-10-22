// `npm run seed` (and `node apps/api/dist/seed.mjs` in the image): creates the demo account with Sixten and Pysen
// (seed.ts). SEED_EMAIL and SEED_PASSWORD name the account; SEED_TODAY pins the day the journal counts back from (tests),
// otherwise today in Sweden. Prints what it did, never the password.
import { z } from 'zod'
import { createDatabase } from './db'
import { accountRepository } from './repositories/accounts'
import { analysisRepository } from './repositories/analyses'
import { horseRepository } from './repositories/horses'
import { journalRepository } from './repositories/journal'
import { seedDemo } from './seed'

const Env = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  SEED_EMAIL: z.email(),
  SEED_PASSWORD: z.string().min(12, { error: 'must be at least 12 characters' }),
  SEED_NAME: z.string().min(1).default('Demo'),
  SEED_TODAY: z.iso.date().optional(),
})

const parsed = Env.safeParse(process.env)
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')} ${i.message}`)
  process.stderr.write(['Invalid seed configuration:', ...issues].join('\n') + '\n')
  process.exit(1)
}
const env = parsed.data
const today = env.SEED_TODAY ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })

const database = createDatabase(env.DATABASE_URL)
try {
  const { db } = database
  const result = await seedDemo(
    {
      accounts: accountRepository(db),
      horses: horseRepository(db),
      analyses: analysisRepository(db),
      journal: journalRepository(db),
    },
    { email: env.SEED_EMAIL, password: env.SEED_PASSWORD, name: env.SEED_NAME, today },
  )
  const horses = result.horsesCreated.length ? result.horsesCreated.join(', ') : 'none (already there)'
  process.stdout.write(
    `Demo account ${env.SEED_EMAIL} ${result.accountCreated ? 'created' : 'already existed'}; horses created: ${horses}.\n`,
  )
} finally {
  await database.close()
}
