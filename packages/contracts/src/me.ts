// GET /api/v1/me: the signed-in user (#22). Only what the web app needs; never tokens or timestamps.
import { z } from 'zod'

export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
})

export const MeResponseSchema = z.object({ user: UserSchema })

export type User = z.infer<typeof UserSchema>
export type MeResponse = z.infer<typeof MeResponseSchema>
