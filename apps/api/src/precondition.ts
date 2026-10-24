// Optimistic concurrency for record edits (#140, ADR 0017): a record carries a version that every write raises, and a
// replacing PUT names the version its copy was read at in If-Match. A save of an older copy is refused with 412, never
// written over a newer one; a PUT that names no version is refused with 428, so no client can overwrite blindly.
import type { Context } from 'hono'
import { problem } from './problem'

// One strong entity tag of a version: "1", "2", ... A weak tag, a list or * would let a save through without naming the
// copy it was based on.
const VERSION_TAG = /^"([1-9][0-9]{0,8})"$/

/** The entity tag of a record's version, for the ETag header. */
export const etag = (version: number) => `"${String(version)}"`

export type Expected = { ok: true; version: number } | { ok: false; response: Response }

/** The version the request's If-Match names, or the problem response when it names none or not one. */
export function expectedVersion(c: Context): Expected {
  const header = c.req.header('If-Match')
  if (header === undefined) return { ok: false, response: problem(c, 428, 'request.precondition_required') }
  const tag = VERSION_TAG.exec(header.trim())
  if (!tag) return { ok: false, response: problem(c, 400, 'request.invalid_precondition') }
  return { ok: true, version: Number(tag[1]) }
}
