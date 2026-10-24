// Optimistic concurrency for record edits (#140, ADR 0017): a record's version, which every write of it raises. A
// replacing PUT names the version its copy was read at in If-Match, and is refused with 412 when the record has moved on.
import { z } from 'zod'

export const VersionSchema = z.number().int().min(1)

/** The If-Match header of a save of the copy read at `version`. */
export const ifMatch = (version: number) => ({ 'If-Match': `"${String(version)}"` })
