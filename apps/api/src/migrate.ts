// Applies pending migrations to DATABASE_URL: `npm run db:migrate`, or `node dist/migrate.mjs` in the image.
// Migrations are applied explicitly, never at API startup and never with drizzle-kit push (ADR 0008).
import { parseMigrationConfig } from './config'
import { migrateDatabase } from './db'

const result = parseMigrationConfig(process.env)
if (!result.ok) {
  process.stderr.write(`${result.message}\n`)
  process.exit(1)
}
await migrateDatabase(result.config.databaseUrl)
process.stdout.write('Migrations applied.\n')
