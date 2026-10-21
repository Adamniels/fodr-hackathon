import { sql } from 'drizzle-orm'
import { describe, expect, inject, it } from 'vitest'
import journal from '../drizzle/meta/_journal.json'
import { createDatabase } from './db'

describe('the database', () => {
  it('is migrated: every migration in the journal is recorded', async () => {
    const database = createDatabase(inject('databaseUrl'))
    try {
      const result = await database.db.execute<{ count: string }>(
        sql`select count(*) from drizzle.__drizzle_migrations`,
      )
      expect(Number(result.rows[0].count)).toBe(journal.entries.length)
    } finally {
      await database.close()
    }
  })

  it('answers a query through the app connection', async () => {
    const database = createDatabase(inject('databaseUrl'))
    try {
      const result = await database.db.execute<{ one: number }>(sql`select 1 as one`)
      expect(result.rows).toEqual([{ one: 1 }])
    } finally {
      await database.close()
    }
  })
})
