// API errors as application/problem+json (RFC 9457) with a stable code (ADR 0013). The shape is the contract in
// @fodr/contracts/problem; this helper writes it for a Hono response.
import type { Problem } from '@fodr/contracts/problem'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

const TITLES = {
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  413: 'Content Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
} as const

export function problem(
  c: Context,
  status: keyof typeof TITLES & ContentfulStatusCode,
  code: string,
  errors?: Problem['errors'],
): Response {
  const body: Problem = {
    type: 'about:blank',
    title: TITLES[status],
    status,
    code,
    requestId: c.get('requestId'),
    ...(errors && { errors }),
  }
  return c.body(JSON.stringify(body), status, { 'Content-Type': 'application/problem+json' })
}
