import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError, authClient, fetchMe } from './auth-client'
import { reportError } from './error-reporting'

vi.mock('./error-reporting', () => ({ reportError: vi.fn() }))

function answer(status: number, body: unknown = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'X-Request-Id': 'req-7' } }))),
  )
}

describe('the account calls reporting failures (#43)', () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports an account route that failed unexpectedly, with its request ID and path', async () => {
    answer(500)
    await expect(authClient.signIn('anna@example.se', 'x')).rejects.toBeInstanceOf(AuthError)
    expect(reportError).toHaveBeenCalledWith(expect.any(AuthError), {
      requestId: 'req-7',
      path: '/api/auth/sign-in/email',
    })
  })

  it('reports a session read that failed unexpectedly', async () => {
    answer(503)
    await expect(fetchMe()).rejects.toBeInstanceOf(AuthError)
    expect(reportError).toHaveBeenCalledWith(expect.any(AuthError), { requestId: 'req-7', path: '/api/v1/me' })
  })

  it('reports no answer given on purpose: a wrong password, no session, too many tries', async () => {
    answer(401, { code: 'INVALID_EMAIL_OR_PASSWORD' })
    await expect(authClient.signIn('anna@example.se', 'x')).rejects.toBeInstanceOf(AuthError)
    answer(429)
    await expect(authClient.signIn('anna@example.se', 'x')).rejects.toBeInstanceOf(AuthError)
    answer(401)
    expect(await fetchMe()).toBeNull()
    expect(reportError).not.toHaveBeenCalled()
  })
})
