import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, callApi } from './api-v1'
import { reportError } from './error-reporting'

vi.mock('./error-reporting', () => ({ reportError: vi.fn() }))

function answer(status: number, body: unknown, requestId = 'req-1') {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(body === undefined ? 'Bad Gateway' : JSON.stringify(body), {
          status,
          headers: { 'X-Request-Id': requestId },
        }),
      ),
    ),
  )
}

const problem = (status: number, code: string) => ({
  type: 'about:blank',
  title: 'x',
  status,
  code,
  requestId: 'req-1',
})

describe('callApi reporting failures (#43)', () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports an internal error with the request ID the API answered with, so both reports link', async () => {
    answer(500, problem(500, 'http.internal_error'), 'req-42')
    await expect(callApi('/horses')).rejects.toBeInstanceOf(ApiError)
    expect(reportError).toHaveBeenCalledTimes(1)
    const [error, requestId] = vi.mocked(reportError).mock.calls[0] ?? []
    expect(error).toMatchObject({ name: 'ApiError', status: 500, code: 'http.internal_error' })
    expect(requestId).toBe('req-42')
  })

  it('reports a 5xx without a problem, as a proxy in front of the API sends', async () => {
    answer(502, undefined)
    await expect(callApi('/horses')).rejects.toBeInstanceOf(ApiError)
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  it('reports no answer the API gives on purpose: the AI unavailable, a refusal, a missing session', async () => {
    answer(502, problem(502, 'ai.unavailable'))
    await expect(callApi('/ai/explain')).rejects.toBeInstanceOf(ApiError)
    answer(503, problem(503, 'ai.not_configured'))
    await expect(callApi('/ai/explain')).rejects.toBeInstanceOf(ApiError)
    answer(400, problem(400, 'request.invalid'))
    await expect(callApi('/horses')).rejects.toBeInstanceOf(ApiError)
    answer(401, problem(401, 'auth.unauthenticated'))
    await expect(callApi('/horses')).rejects.toBeInstanceOf(ApiError)
    expect(reportError).not.toHaveBeenCalled()
  })
})
