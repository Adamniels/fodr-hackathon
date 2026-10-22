import * as Sentry from '@sentry/node'
import { DrizzleQueryError } from 'drizzle-orm'
import { DatabaseError } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createErrorReporter, noErrorReporter, type ErrorReporter } from './error-reporting'

// What would leave the process: every event the SDK hands its transport, after its own processing and beforeSend.
const sent: unknown[] = []
const transport: Sentry.NodeOptions['transport'] = () => ({
  send: (envelope) => {
    for (const [header, payload] of envelope[1]) if (header.type === 'event') sent.push(payload)
    return Promise.resolve({})
  },
  flush: () => Promise.resolve(true),
})

const CONFIG = {
  appVersion: '6efb5f1',
  errorTracking: { dsn: 'https://abc123@o1.ingest.de.sentry.io/2', environment: 'production' },
}

describe('createErrorReporter', () => {
  it('sends nothing without a DSN', () => {
    expect(createErrorReporter({ ...CONFIG, errorTracking: { dsn: undefined, environment: 'test' } })).toBe(
      noErrorReporter,
    )
  })

  describe('with a DSN', () => {
    let reporter: ErrorReporter
    beforeAll(() => {
      reporter = createErrorReporter(CONFIG, transport)
    })
    beforeEach(() => {
      sent.length = 0
    })
    afterAll(async () => {
      await Sentry.close()
    })

    async function reported(error: unknown) {
      reporter.report(error, { requestId: 'req-1', userId: 'user-1' })
      await Sentry.flush()
      expect(sent).toHaveLength(1)
      return sent[0] as Sentry.ErrorEvent
    }

    it('sends the error with its request ID, the user ID, the release and the environment', async () => {
      const event = await reported(new TypeError('x is undefined'))
      expect(event.exception?.values?.[0]).toMatchObject({ type: 'TypeError', value: 'x is undefined' })
      expect(event.tags).toMatchObject({ request_id: 'req-1' })
      expect(event.user).toEqual({ id: 'user-1' })
      expect(event).toMatchObject({ release: '6efb5f1', environment: 'production' })
    })

    it('sends no email address an error message holds', async () => {
      const event = await reported(new Error('no account for anna@example.se'))
      expect(event.exception?.values?.[0]?.value).toBe('no account for [email]')
    })

    // The same failure the logs keep without its SQL, parameters and row values (app.test.ts).
    it('sends a failed query without its SQL, parameters or row values, with its cause and Postgres code', async () => {
      const pgError = new DatabaseError('duplicate key value violates unique constraint "users_email_key"', 0, 'error')
      pgError.code = '23505'
      pgError.detail = 'Key (email)=(anna@example.se) already exists.'
      const failed = new DrizzleQueryError(
        'insert into "users" ("email", "note") values ($1, $2)',
        ['anna@example.se', 'fang 2025'],
        pgError,
      )
      const event = await reported(new Error('saving the horse failed', { cause: failed }))
      // Each frame carries the source lines around it (ContextLines): Fodr's own code, which here is this test with its
      // fixtures, so they are left out of what the error itself may not carry.
      const text = JSON.stringify(event, (key, value: unknown) =>
        ['pre_context', 'context_line', 'post_context'].includes(key) ? undefined : value,
      )
      expect(text).not.toMatch(/anna@example\.se|fang 2025|insert into/)
      const types = event.exception?.values?.map((v) => v.type)
      expect(types).toEqual(expect.arrayContaining(['Error', 'DrizzleQueryError', 'DatabaseError']))
      expect(text).toMatch(/23505/)
      expect(text).toMatch(/error-reporting\.test\.ts/)
    })
  })
})
