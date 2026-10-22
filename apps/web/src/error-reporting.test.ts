import * as Sentry from '@sentry/react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from './api-v1'
import { reportError, startErrorReporting } from './error-reporting'

// What would leave the browser: every event the SDK hands its transport, after its own processing and beforeSend.
const sent: Sentry.ErrorEvent[] = []
const transport: Sentry.BrowserOptions['transport'] = () => ({
  send: (envelope) => {
    for (const [header, payload] of envelope[1]) if (header.type === 'event') sent.push(payload as Sentry.ErrorEvent)
    return Promise.resolve({})
  },
  flush: () => Promise.resolve(true),
})

describe('error reporting in the browser (#43)', () => {
  it('sends nothing before it is started with a DSN', async () => {
    startErrorReporting({ VITE_SENTRY_ENVIRONMENT: 'production' } as ImportMetaEnv, transport)
    reportError(new Error('not sent'))
    await Sentry.flush()
    expect(sent).toEqual([])
  })

  describe('with a DSN', () => {
    beforeAll(() => {
      startErrorReporting(
        {
          VITE_SENTRY_DSN: 'https://abc123@o1.ingest.de.sentry.io/3',
          VITE_SENTRY_ENVIRONMENT: 'production',
          VITE_APP_VERSION: '6efb5f1',
        } as ImportMetaEnv,
        transport,
      )
    })
    beforeEach(() => {
      sent.length = 0
    })

    it('sends a failed API call with the request ID, the release and the environment', async () => {
      reportError(new ApiError(500, 'http.internal_error'), 'req-42')
      await Sentry.flush()
      expect(sent).toHaveLength(1)
      expect(sent[0]?.exception?.values?.[0]).toMatchObject({ type: 'ApiError', value: 'http.internal_error' })
      expect(sent[0]?.tags).toMatchObject({ request_id: 'req-42' })
      expect(sent[0]).toMatchObject({ release: '6efb5f1', environment: 'production' })
    })

    it('sends no email address an error message holds', async () => {
      reportError(new Error('no account for anna@example.se'))
      await Sentry.flush()
      expect(sent[0]?.exception?.values?.[0]?.value).toBe('no account for [email]')
    })
  })
})
