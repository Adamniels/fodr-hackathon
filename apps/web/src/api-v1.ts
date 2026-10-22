// Calls to the API's own resources under /api/v1 (horses #25, analyses #26), over fetch with the session cookie (same
// origin, ADR 0005). A failure is an ApiError with the problem code when the server sent one (ADR 0013).
import type { QueryClient } from '@tanstack/react-query'
import { ProblemSchema } from '@fodr/contracts/problem'
import { ME_QUERY_KEY } from './auth-client'

export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(status: number, code: string | undefined) {
    super(code ?? `HTTP ${String(status)}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
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
  throw new ApiError(res.status, problem.success ? problem.data.code : undefined)
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
