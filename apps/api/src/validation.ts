// Request bodies validated against the shared contracts (ADR 0007) before any handler logic: a body that is not JSON
// or does not match is a problem+json 400 with each field's path and zod's issue code (ADR 0013). The path is dotted
// ("grovfoder.kgPerDag", "nuvarandeFoder.0.gramPerDag"), and "" for the body itself (null, an array). Only
// application/json is read: a 415 otherwise, so a form or text/plain request from another page never counts as JSON.
import type { Context } from 'hono'
import type { z } from 'zod'
import { problem } from './problem'

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response }

export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<Parsed<z.infer<S>>> {
  const type = c.req.header('Content-Type')?.split(';')[0]?.trim().toLowerCase()
  if (type !== 'application/json') return { ok: false, response: problem(c, 415, 'request.unsupported_media_type') }
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return { ok: false, response: problem(c, 400, 'validation.invalid_json') }
  }
  const result = schema.safeParse(body)
  if (result.success) return { ok: true, data: result.data }
  const errors = result.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code }))
  return { ok: false, response: problem(c, 400, 'validation.invalid', errors) }
}
