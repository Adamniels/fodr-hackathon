// Intercepts every /api request in the browser. Known AI routes answer from fixtures; anything else is aborted
// and recorded, and the test fixture in helpers.ts fails the test if that happened.

import type { Page } from '@playwright/test'
import * as fixtures from '../fixtures/ai'

export type AiRoute = 'analys' | 'profil' | 'forklaring' | 'journal'

export interface AiMock {
  /** Parsed request bodies received on a route, in order. */
  calls(route: AiRoute): unknown[]
  /** Replace the response for a route for the rest of the test. */
  respondWith(route: AiRoute, body: unknown, status?: number): void
  /** Paths of /api requests that no mock handled. */
  unexpected(): string[]
}

const DEFAULTS: Record<AiRoute, unknown> = {
  analys: fixtures.analysA01,
  profil: fixtures.profil,
  forklaring: fixtures.forklaring,
  journal: fixtures.journal,
}

function isAiRoute(name: string): name is AiRoute {
  return name in DEFAULTS
}

export async function mockAi(page: Page): Promise<AiMock> {
  const responses = new Map<AiRoute, { body: unknown; status: number }>()
  const calls = new Map<AiRoute, unknown[]>()
  const unexpected: string[] = []

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const name = new URL(request.url()).pathname.slice('/api/'.length)
      if (!isAiRoute(name) || request.method() !== 'POST') {
        unexpected.push(`${request.method()} ${new URL(request.url()).pathname}`)
        await route.abort()
        return
      }
      calls.set(name, [...(calls.get(name) ?? []), request.postDataJSON() as unknown])
      const response = responses.get(name) ?? { body: DEFAULTS[name], status: 200 }
      await route.fulfill({ status: response.status, json: response.body })
    },
  )

  return {
    calls: (route) => calls.get(route) ?? [],
    respondWith: (route, body, status = 200) => responses.set(route, { body, status }),
    unexpected: () => [...unexpected],
  }
}
