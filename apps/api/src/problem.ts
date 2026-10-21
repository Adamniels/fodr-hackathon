// API errors as application/problem+json (RFC 9457) with a stable code (ADR 0013). The shape is the contract in
// @fodr/contracts/problem; this helper writes it for a Hono response.
import type { Problem } from '@fodr/contracts/problem'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

const TITLES = { 401: 'Unauthorized', 404: 'Not Found', 500: 'Internal Server Error' } as const

export function problem(c: Context, status: keyof typeof TITLES & ContentfulStatusCode, code: string): Response {
  const body: Problem = { type: 'about:blank', title: TITLES[status], status, code, requestId: c.get('requestId') }
  return c.body(JSON.stringify(body), status, { 'Content-Type': 'application/problem+json' })
}
