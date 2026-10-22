// Calls to the API's own resources under /api/v1 (horses #25, analyses #26), over fetch with the session cookie (same
// origin, ADR 0005). A failure is an ApiError with the problem code when the server sent one (ADR 0013); an unexpected
// one is reported (#43).
import type { QueryClient } from '@tanstack/react-query'
import { ProblemSchema } from '@fodr/contracts/problem'
import { ME_QUERY_KEY } from './auth-client'
import { reportError } from './error-reporting'

export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined
  /** The API's X-Request-Id for the call, which its logs and error reports carry too. */
  readonly requestId: string | undefined

  constructor(status: number, code: string | undefined, requestId?: string) {
    super(code ?? `HTTP ${String(status)}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

/** A request to /api/v1<path>; a JSON body is sent as such, a form with its own multipart type. */
export async function callApi(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (res.ok) return res
  const problem = ProblemSchema.safeParse(await res.json().catch(() => null))
  const error = new ApiError(
    res.status,
    problem.success ? problem.data.code : undefined,
    res.headers.get('X-Request-Id') ?? undefined,
  )
  // The API failed unexpectedly, or something in front of it did (#43). A 5xx with its own code (the AI unavailable)
  // is an answer the API gives on purpose, and is not reported.
  if (res.status >= 500 && (error.code === undefined || error.code === 'http.internal_error')) {
    reportError(error, { requestId: error.requestId, path: `/api/v1${path.split('?', 1)[0] ?? ''}` })
  }
  throw error
}

/** Whether the server refused the request as invalid, which sending it again cannot change. */
export const refusedByServer = (e: unknown) => e instanceof ApiError && [400, 413, 415].includes(e.status)

/**
 * Wraps a request so that an expired session (401) reads the session again, and the workspace gate then sends to
 * /login. The error still reaches the caller.
 */
export const sessionGuard =
  (queryClient: QueryClient) =>
  async <T>(request: Promise<T>): Promise<T> => {
    try {
      return await request
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
      throw e
    }
  }
