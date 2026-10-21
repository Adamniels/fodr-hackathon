// Request bodies validated against the shared contracts (ADR 0007) before any handler logic: a body that is not JSON
// or does not match is a problem+json 400 with each field's path and zod's issue code (ADR 0013).
import type { Context } from 'hono'
import type { z } from 'zod'
import { problem } from './problem'

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response }

export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<Parsed<z.infer<S>>> {
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
