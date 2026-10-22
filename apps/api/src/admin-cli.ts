// `npm run admin:grant -- <email>` and `npm run admin:revoke -- <email>` (and `node apps/api/dist/admin.mjs grant
// <email>` in the image): gives an account the admin role, or takes it back (#36, CF9). Only an existing account whose
// email is verified. Takes effect on the account's next request, no restart: the role is read with the session.
import { z } from 'zod'
import { createDatabase } from './db'
import { accountRepository } from './repositories/accounts'

const ROLES = { grant: 'admin', revoke: 'user' } as const
const [action, email] = process.argv.slice(2)
const env = z
  .object({ DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }) })
  .safeParse(process.env)
if (!env.success) {
  process.stderr.write(`Invalid configuration: DATABASE_URL ${env.error.issues[0]?.message ?? ''}\n`)
  process.exit(1)
}
if (!(action in ROLES) || !z.email().safeParse(email).success) {
  process.stderr.write('Usage: admin.mjs grant|revoke <email>\n')
  process.exit(1)
}

const role = ROLES[action as keyof typeof ROLES]
const database = createDatabase(env.data.DATABASE_URL)
let exitCode = 0
try {
  const result = await accountRepository(database.db).setRole(email, role)
  if (result === 'ok') process.stdout.write(`${email} is now ${role === 'admin' ? 'an admin' : 'a user'}.\n`)
  else {
    exitCode = 1
    process.stderr.write(
      result === 'not_found'
        ? `No account ${email}. Nothing changed.\n`
        : `${email} has not verified its email. Nothing changed.\n`,
    )
  }
} catch (e) {
  exitCode = 1
  process.stderr.write(`Failed (${e instanceof Error ? e.constructor.name : typeof e}). Nothing changed.\n`)
} finally {
  await database.close()
}
process.exit(exitCode)
