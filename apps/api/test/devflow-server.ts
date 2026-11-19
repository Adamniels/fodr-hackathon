// The API for Dev flow's screenshots (scripts/devflow/start.sh): the real server, with every request signed in as the
// demo account, so a worker's screenshot of a page shows the page and not the login. Playwright's screenshot command
// cannot log in, so the server does: on the first request it signs in through its own /api/auth route, and from then on
// it puts that session's cookie on every request. The AI is a fake that refuses, since a screenshot only opens pages.
//
// It lives under test/, which the production image never contains (Dockerfile, build.mjs), and refuses to start
// unless DEVFLOW=1, which only a Dev flow worker sets.
import { AiProviderError, type AiProvider } from '../src/ai/provider'
import { runServer, type ServerFetch } from '../src/server'

if (process.env.DEVFLOW !== '1') {
  process.stderr.write('devflow-server signs every request in as the demo account and runs only with DEVFLOW=1\n')
  process.exit(1)
}

const email = process.env.SEED_EMAIL
const password = process.env.SEED_PASSWORD
const origin = process.env.BETTER_AUTH_URL
if (!email || !password || !origin) {
  process.stderr.write('devflow-server needs SEED_EMAIL, SEED_PASSWORD and BETTER_AUTH_URL\n')
  process.exit(1)
}

const noAi = () => Promise.reject(new AiProviderError('missing_key'))
const refusingProvider: AiProvider = {
  readAnalysis: noAi,
  interpretProfile: noAi,
  explainPlan: noAi,
  analyzeJournal: noAi,
}

type Rest = Parameters<ServerFetch> extends [Request, ...infer R] ? R : never

/** Signs every request in as the seeded account, signing in once on the first request and again if that failed. */
function signedIn(fetch: ServerFetch): ServerFetch {
  let cookie: string | undefined
  async function signIn(rest: Rest): Promise<string | undefined> {
    const request = new Request(new URL('/api/auth/sign-in/email', origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: new URL(origin as string).origin },
      body: JSON.stringify({ email, password }),
    })
    const response = await fetch(request, ...rest)
    if (!response.ok) {
      process.stderr.write(`devflow-server: signing in as ${email ?? ''} answered ${String(response.status)}\n`)
      return undefined
    }
    return response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
  }
  return async (request: Request, ...rest: Rest) => {
    cookie ??= await signIn(rest)
    if (cookie === undefined) return fetch(request, ...rest)
    const headers = new Headers(request.headers)
    headers.set('cookie', cookie)
    // Node needs duplex to copy a request that has a body.
    return fetch(new Request(request, { headers, duplex: 'half' }), ...rest)
  }
}

runServer(() => refusingProvider, { wrapFetch: signedIn })
