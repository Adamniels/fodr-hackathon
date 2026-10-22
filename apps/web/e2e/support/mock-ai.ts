// Intercepts /api requests in the browser context. The AI routes (/api/v1/ai/*, #30) answer from fixtures; any other
// /api request outside the real backend is aborted and recorded, and the test fixture in helpers.ts fails the test if
// that happened. The rest of /api/v1 and /api/auth is not intercepted: it belongs to the real backend (ADR 0007,
// ADR 0009). Report reading happens inside the API (#26), with a fake AI there (apps/api/test/e2e-server.ts).

import { expect, type BrowserContext } from '@playwright/test'
import * as fixtures from '../fixtures/ai'

export type AiRoute = 'profile' | 'explanation' | 'journal'

export interface AiMock {
  /** Parsed request bodies received on a route, in order. */
  calls(route: AiRoute): unknown[]
  /** Replace the response for a route for the rest of the test. */
  respondWith(route: AiRoute, body: unknown, status?: number): void
  /** Paths of /api requests that no mock handled. */
  unexpected(): string[]
  /** Resolves once no request is being handled and none has arrived for a quiet window after the call. */
  settled(): Promise<void>
}

const QUIET_MS = 500

/** An error answer as the API sends it (problem+json, ADR 0013), for respondWith. */
export const problem = (status: number, code: string) => ({
  type: 'about:blank',
  title: 'Error',
  status,
  code,
  requestId: 'e2e',
})

// The AI routes are under /api/v1/ai (#30); the rest of /api/v1 and /api/auth is the real backend.
const isAi = (path: string) => path.startsWith('/api/v1/ai/')
const isBackend = (path: string) =>
  !isAi(path) && ['/api/v1', '/api/auth'].some((p) => path === p || path.startsWith(`${p}/`))

const DEFAULTS: Record<AiRoute, unknown> = {
  profile: fixtures.profil,
  explanation: fixtures.forklaring,
  journal: fixtures.journal,
}

function isAiRoute(name: string): name is AiRoute {
  return name in DEFAULTS
}

export async function mockAi(context: BrowserContext): Promise<AiMock> {
  const responses = new Map<AiRoute, { body: unknown; status: number }>()
  const calls = new Map<AiRoute, unknown[]>()
  const unexpected: string[] = []
  let inFlight = 0
  let lastActivity = Date.now()

  await context.route(
    (url) => url.pathname.startsWith('/api/') && !isBackend(url.pathname),
    async (route) => {
      inFlight++
      lastActivity = Date.now()
      try {
        const request = route.request()
        const path = new URL(request.url()).pathname
        const name = isAi(path) ? path.slice('/api/v1/ai/'.length) : path
        if (!isAiRoute(name) || request.method() !== 'POST') {
          unexpected.push(`${request.method()} ${new URL(request.url()).pathname}`)
          await route.abort()
          return
        }
        calls.set(name, [...(calls.get(name) ?? []), request.postDataJSON() as unknown])
        const response = responses.get(name) ?? { body: DEFAULTS[name], status: 200 }
        await route.fulfill({ status: response.status, json: response.body })
      } finally {
        inFlight--
        lastActivity = Date.now()
      }
    },
  )

  return {
    calls: (route) => calls.get(route) ?? [],
    respondWith: (route, body, status = 200) => responses.set(route, { body, status }),
    unexpected: () => [...unexpected],
    settled: () => {
      // The window starts no earlier than the call, so a request arriving just after a quiet period is seen.
      const since = Date.now()
      return expect
        .poll(() => inFlight === 0 && Date.now() - Math.max(lastActivity, since) >= QUIET_MS, {
          message: 'AI requests to settle',
        })
        .toBe(true)
    },
  }
}
