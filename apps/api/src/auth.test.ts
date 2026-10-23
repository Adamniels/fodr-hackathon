import { APIError } from 'better-auth/api'
import { describe, expect, it } from 'vitest'
import { recordingErrorReporter } from '../test/fake-error-reporter'
import { unitAuth } from '../test/unit-deps'

// Better Auth catches the errors of its own routes and hands them to onAPIError, never to the app's onError (#43).
describe('error reports from the account routes', () => {
  function onError(error: unknown) {
    const errors = recordingErrorReporter()
    const auth = unitAuth(errors)
    auth.options.onAPIError.onError(error)
    return errors.reports
  }

  it('reports an unexpected error and an internal one', () => {
    const crash = new TypeError('x is undefined')
    expect(onError(crash)).toEqual([{ error: crash, context: {} }])
    expect(onError(new APIError('INTERNAL_SERVER_ERROR'))).toHaveLength(1)
  })

  it('reports no answer it gives on purpose: a refused sign-in, a missing name', () => {
    expect(onError(new APIError('UNAUTHORIZED', { code: 'INVALID_EMAIL_OR_PASSWORD' }))).toEqual([])
    expect(onError(new APIError('BAD_REQUEST', { code: 'NAME_REQUIRED' }))).toEqual([])
  })
})
