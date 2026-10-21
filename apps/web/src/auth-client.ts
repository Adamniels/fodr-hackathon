// The web app's calls to the account API (#23): Better Auth's routes under /api/auth (ADR 0009) and GET /api/v1/me,
// over fetch with the session cookie (same origin, ADR 0005). Better Auth answers errors as { code, message }, not
// problem+json (ADR 0009 note); a failure becomes an AuthError with the code, which the UI turns into text with
// authErrorText (i18n/auth.ts).
import { MeResponseSchema, type User } from '@fodr/contracts/me'

/** Better Auth's error code, RATE_LIMITED for a 429 (which has none), or UNKNOWN. */
export class AuthError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'AuthError'
    this.code = code
  }
}

// Where the mailed links land: signed in, /login sends on to /horses; with ?error, /login says the link failed.
const LINK_TARGET = '/login'

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(`/api/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.ok) return
  if (res.status === 429) throw new AuthError('RATE_LIMITED')
  const data = (await res.json().catch(() => ({}))) as { code?: unknown }
  throw new AuthError(typeof data.code === 'string' ? data.code : 'UNKNOWN')
}

export const authClient = {
  signUp: (name: string, email: string, password: string) =>
    post('/sign-up/email', { name, email, password, callbackURL: LINK_TARGET }),
  signIn: (email: string, password: string) => post('/sign-in/email', { email, password }),
  signOut: () => post('/sign-out', {}),
  sendMagicLink: (email: string) => post('/sign-in/magic-link', { email, callbackURL: LINK_TARGET }),
  sendVerification: (email: string) => post('/send-verification-email', { email, callbackURL: LINK_TARGET }),
  requestPasswordReset: (email: string) => post('/request-password-reset', { email, redirectTo: '/reset-password' }),
  resetPassword: (token: string, newPassword: string) => post('/reset-password', { token, newPassword }),
}

/** The signed-in user, or null without a session. */
export async function fetchMe(): Promise<User | null> {
  const res = await fetch('/api/v1/me')
  if (res.status === 401) return null
  if (!res.ok) throw new AuthError('UNKNOWN')
  return MeResponseSchema.parse(await res.json()).user
}
