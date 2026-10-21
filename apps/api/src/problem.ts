// API errors as application/problem+json (RFC 9457) with a stable code (ADR 0013). The web app maps the code to a
// translated message; the title is the HTTP status phrase, for developers. Moves to packages/contracts with the first
// route the web app calls (#22).
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export interface Problem {
  type: 'about:blank'
  title: string
  status: number
  code: string
  requestId: string
}

const TITLES = { 404: 'Not Found', 500: 'Internal Server Error' } as const

export function problem(c: Context, status: keyof typeof TITLES & ContentfulStatusCode, code: string): Response {
  const body: Problem = { type: 'about:blank', title: TITLES[status], status, code, requestId: c.get('requestId') }
  return c.body(JSON.stringify(body), status, { 'Content-Type': 'application/problem+json' })
}
