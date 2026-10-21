// The signed-in user for protected routes: requireUser answers a request without a valid session with a problem+json
// 401 (CF1) and otherwise puts the user on the context for the handler.
import { createMiddleware } from 'hono/factory'
import type { User } from '@fodr/contracts/me'
import type { Auth } from './auth'
import { problem } from './problem'

export type UserVariables = { user: User }

export function requireUser(auth: Auth) {
  return createMiddleware<{ Variables: UserVariables }>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) return problem(c, 401, 'auth.unauthenticated')
    const { id, name, email, emailVerified } = session.user
    c.set('user', { id, name, email, emailVerified })
    await next()
  })
}
