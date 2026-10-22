// The API for the web app's e2e run (apps/web/playwright.config.ts): the real server with a fake AI, since report
// reading happens in the API (#26) where the browser's AI mock cannot reach. The fake reads the answer a test wants
// from the uploaded file itself: a line `FODR-E2E-READING <json>` in the generated test file
// (apps/web/e2e/support/reports.ts). A reading of `{"error": "<kind>"}` fails as the provider would.
import { AiProviderError, type AiErrorKind, type AiProvider } from '../src/ai/provider'
import type { AnalysisResponse } from '../src/ai/anthropic'
import { runServer } from '../src/server'

const MARKER = 'FODR-E2E-READING '

const notInE2e = () => Promise.reject(new Error('mocked in the browser (e2e/support/mock-ai.ts)'))

const markerProvider: AiProvider = {
  readAnalysis({ base64 }) {
    const text = Buffer.from(base64, 'base64').toString('latin1')
    const line = text.split('\n').find((l) => l.startsWith(MARKER))
    if (!line) return Promise.reject(new Error('The e2e report has no reading'))
    const reading = JSON.parse(line.slice(MARKER.length)) as AnalysisResponse | { error: AiErrorKind }
    if ('error' in reading) return Promise.reject(new AiProviderError(reading.error, 500))
    return Promise.resolve({ value: reading, usage: { inputTokens: 1000, outputTokens: 200 } })
  },
  interpretProfile: notInE2e,
  explainPlan: notInE2e,
  analyzeJournal: notInE2e,
}

runServer(() => markerProvider)
