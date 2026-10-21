// An API error as application/problem+json (RFC 9457) with a stable code (ADR 0013). The web app maps the code to a
// translated message; the title is the HTTP status phrase, for developers.
import { z } from 'zod'

export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  requestId: z.string(),
  errors: z.array(z.object({ path: z.string(), code: z.string() })).optional(),
})

export type Problem = z.infer<typeof ProblemSchema>
