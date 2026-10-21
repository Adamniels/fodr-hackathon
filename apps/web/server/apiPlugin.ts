// Mounts /api/* as middleware in Vite's dev server. Running locally is enough for the demo;
// the same functions in ai.ts can later move to serverless functions when hosted.

import type { IncomingMessage, ServerResponse } from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import type { Connect, Plugin } from 'vite'
import { analyzeJournal, explainPlan, readAnalysis, interpretProfile } from './ai'

const MAX_BODY_BYTES = 20 * 1024 * 1024

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new Error('Filen är för stor (max 20 MB).')
    chunks.push(chunk as Buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

// The body is not validated beyond JSON parsing; the server only runs locally during the demo.
const ROUTES: Record<string, (body: unknown) => Promise<unknown>> = {
  '/api/analys': (b) => readAnalysis(b as Parameters<typeof readAnalysis>[0]),
  '/api/profil': (b) => interpretProfile(b as Parameters<typeof interpretProfile>[0]),
  '/api/forklaring': async (b) => ({ text: await explainPlan(b) }),
  '/api/journal': (b) => analyzeJournal(b),
}

async function handle(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction): Promise<void> {
  const route = req.url ? ROUTES[req.url] : undefined
  if (!route || req.method !== 'POST') {
    next()
    return
  }
  try {
    send(res, 200, await route(await readJson(req)))
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      send(res, 500, { fel: 'API-nyckeln saknas eller är ogiltig. Lägg den i app/.env.' })
      return
    }
    if (e instanceof Anthropic.RateLimitError) {
      send(res, 429, { fel: 'För många anrop just nu. Vänta en stund och försök igen.' })
      return
    }
    if (e instanceof Anthropic.APIError) {
      send(res, 502, { fel: `AI-tjänsten svarade med fel ${e.status}.` })
      return
    }
    send(res, 500, { fel: e instanceof Error ? e.message : 'Okänt fel' })
  }
}

export function apiPlugin(): Plugin {
  return {
    name: 'krubba-api',
    configureServer(server) {
      // Connect ignores returned promises; handle catches its own errors.
      server.middlewares.use((req, res, next) => void handle(req, res, next))
    },
  }
}
