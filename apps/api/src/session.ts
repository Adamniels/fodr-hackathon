// The signed-in user for protected routes: requireUser answers a request without a valid session with a problem+json
// 401 (CF1) and otherwise puts the user on the context for the handler. When Better Auth renews an aging session it
// sends a new cookie, which goes out with the response, so an active user stays signed in.
import { createMiddleware } from 'hono/factory'
import type { User } from '@fodr/contracts/me'
import type { Auth } from './auth'
import { problem } from './problem'

export type UserVariables = { user: User }

export function requireUser(auth: Auth) {
  return createMiddleware<{ Variables: UserVariables }>(async (c, next) => {
    const { headers, response: session } = await auth.api.getSession({
      headers: c.req.raw.headers,
      returnHeaders: true,
    })
    for (const cookie of headers.getSetCookie()) c.header('Set-Cookie', cookie, { append: true })
    if (!session) return problem(c, 401, 'auth.unauthenticated')
    const { id, name, email, emailVerified } = session.user
    c.set('user', { id, name, email, emailVerified })
    await next()
  })
}
