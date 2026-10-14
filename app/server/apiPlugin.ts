// Monterar /api/* som middleware i Vites dev-server. Lokal körning räcker för demon;
// samma funktioner i ai.ts kan senare flyttas till serverless-funktioner vid hosting.

import type { IncomingMessage, ServerResponse } from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import type { Plugin } from 'vite'
import { analyseraJournal, forklaraPlan, lasAnalys, tolkaProfil } from './ai'

const MAX_BODY_BYTES = 20 * 1024 * 1024

async function lasJson(req: IncomingMessage): Promise<unknown> {
  const delar: Buffer[] = []
  let storlek = 0
  for await (const del of req) {
    storlek += (del as Buffer).length
    if (storlek > MAX_BODY_BYTES) throw new Error('Filen är för stor (max 20 MB).')
    delar.push(del as Buffer)
  }
  return JSON.parse(Buffer.concat(delar).toString('utf8'))
}

function skicka(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

// Bodyn valideras inte utöver JSON-parsning; servern körs bara lokalt under demon.
const ROUTES: Record<string, (body: unknown) => Promise<unknown>> = {
  '/api/analys': (b) => lasAnalys(b as Parameters<typeof lasAnalys>[0]),
  '/api/profil': (b) => tolkaProfil(b as Parameters<typeof tolkaProfil>[0]),
  '/api/forklaring': async (b) => ({ text: await forklaraPlan(b) }),
  '/api/journal': (b) => analyseraJournal(b),
}

export function apiPlugin(): Plugin {
  return {
    name: 'krubba-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const route = req.url ? ROUTES[req.url] : undefined
        if (!route || req.method !== 'POST') return next()
        try {
          skicka(res, 200, await route(await lasJson(req)))
        } catch (e) {
          if (e instanceof Anthropic.AuthenticationError) {
            return skicka(res, 500, { fel: 'API-nyckeln saknas eller är ogiltig. Lägg den i app/.env.' })
          }
          if (e instanceof Anthropic.RateLimitError) {
            return skicka(res, 429, { fel: 'För många anrop just nu. Vänta en stund och försök igen.' })
          }
          if (e instanceof Anthropic.APIError) {
            return skicka(res, 502, { fel: `AI-tjänsten svarade med fel ${e.status}.` })
          }
          skicka(res, 500, { fel: e instanceof Error ? e.message : 'Okänt fel' })
        }
      })
    },
  }
}
