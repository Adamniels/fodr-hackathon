// The plan explanations of the web app's e2e API (#32), shared by the fake AI there (e2e-server.ts) and the tests that
// read them (apps/web/e2e). The explanation names the horse, so a test sees which plan it explains. A test that needs
// the AI to fail writes a marker into the horse's "Övrigt" note, which reaches the request: the steps it lists answer
// that horse's successive explanation calls ('ok', or an error kind), the last step repeating. Each marker has its own
// token, so tests running in parallel never share steps.
import { randomUUID } from 'node:crypto'
import type { ExplanationRequest } from '@fodr/contracts/ai'
import { AiProviderError, type AiErrorKind, type AiReply } from '../src/ai/provider'

const MARKER = /FODR-E2E-EXPLANATION (\S+) (\S+)/

/** The explanation the e2e API writes for a horse's plan, as two paragraphs. */
export const e2eExplanationText = (horseName: string) => `E2E-förklaring av planen för ${horseName}.\nStycke två.`

/** The note that makes the explanation calls of the horse go as `steps`. */
export const explanationMarker = (steps: ('ok' | AiErrorKind)[]) =>
  `FODR-E2E-EXPLANATION ${randomUUID()} ${steps.join(',')}`

/** The fake AI's explainPlan: the explanation, or the step the horse's marker gives for this call. */
export function e2eExplainer(): (request: ExplanationRequest) => Promise<AiReply<string>> {
  const calls = new Map<string, number>()
  return (request) => {
    const marker = MARKER.exec(request.hast.ovrigt)
    if (marker) {
      const [, token, list] = marker
      const call = calls.get(token) ?? 0
      calls.set(token, call + 1)
      const steps = list.split(',')
      const step = steps[Math.min(call, steps.length - 1)]
      if (step !== 'ok') return Promise.reject(new AiProviderError(step as AiErrorKind, 500))
    }
    return Promise.resolve({
      value: e2eExplanationText(request.hast.namn),
      usage: { inputTokens: 1000, outputTokens: 200 },
    })
  }
}
