import { defineConfig } from 'drizzle-kit'

// Used by `npm run db:generate` only, which writes SQL from the schema; migrations are applied with src/migrate.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
})
