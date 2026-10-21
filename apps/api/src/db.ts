// The Postgres connection through Drizzle over the plain pg driver (ADR 0005, ADR 0008). The pool connects on the
// first query.
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import * as schema from './db/schema'

// apps/api/drizzle, from src/ in development and from dist/ in the image alike.
const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url))

export interface Database {
  db: NodePgDatabase<typeof schema>
  close(): Promise<void>
}

export function createDatabase(url: string): Database {
  const pool = new pg.Pool({ connectionString: url })
  return { db: drizzle(pool, { schema }), close: () => pool.end() }
}

/** Applies every migration in drizzle/ that the database has not recorded yet. */
export async function migrateDatabase(url: string): Promise<void> {
  const database = createDatabase(url)
  try {
    await migrate(database.db, { migrationsFolder: MIGRATIONS_DIR })
  } finally {
    await database.close()
  }
}
