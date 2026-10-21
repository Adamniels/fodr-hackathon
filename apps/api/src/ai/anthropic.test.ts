// The Anthropic provider with the SDK on a fake fetch: no network, no key needed.
import type { ClientOptions } from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { createAnthropicProvider } from './anthropic'
import { AiProviderError } from './provider'

const ANALYSIS = {
  arAnalys: true,
  typ: 'hosilage',
  labb: 'Eurofins',
  provdatum: '2026-06-01',
  tsProcent: 55,
  askaGPerKgTs: 70,
  perKgTs: {
    energi: 10.2,
    energiIdisslare: null,
    smbRp: 70,
    raprotein: 110,
    ca: 4,
    p: 2.5,
    mg: 1.5,
    na: 0.3,
    fe: 200,
    mn: 60,
    cu: 6,
    zn: 25,
    co: null,
    jod: null,
    se: null,
    socker: 90,
    starkelse: null,
  },
  anmarkningar: [],
}

function message(text: string, stopReason = 'end_turn') {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  }
}

// A provider whose SDK answers every request with the given status and body, recording the request bodies.
function provider(status: number, body: unknown, withKey = true) {
  const requests: Record<string, unknown>[] = []
  const fetch: ClientOptions['fetch'] = (_url, init) => {
    requests.push(JSON.parse(init?.body as string) as Record<string, unknown>)
    return Promise.resolve(Response.json(body, { status, headers: { 'request-id': 'req_1' } }))
  }
  return {
    ai: createAnthropicProvider({ apiKey: withKey ? 'test-key' : undefined, clientOptions: { fetch, maxRetries: 0 } }),
    requests,
  }
}

const PDF = { mediaType: 'application/pdf', base64: 'JVBERi0=' }

describe('the Anthropic provider', () => {
  it('reads an analysis: sends the document to the model and returns the parsed reply', async () => {
    const { ai, requests } = provider(200, message(JSON.stringify(ANALYSIS)))
    expect(await ai.readAnalysis(PDF)).toEqual(ANALYSIS)
    expect(requests[0]).toMatchObject({
      model: 'claude-sonnet-5-5',
      max_tokens: 16000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' } },
            { type: 'text' },
          ],
        },
      ],
    })
  })

  it('sends an image report as an image', async () => {
    const { ai, requests } = provider(200, message(JSON.stringify(ANALYSIS)))
    await ai.readAnalysis({ mediaType: 'image/png', base64: 'iVBORw0=' })
    expect(requests[0]).toMatchObject({
      messages: [{ content: [{ type: 'image', source: { media_type: 'image/png', data: 'iVBORw0=' } }, {}] }],
    })
  })

  it('explains a plan with the text of the reply', async () => {
    const { ai, requests } = provider(200, message('Grovfodret räcker.'))
    expect(await ai.explainPlan({ behov: 1 })).toBe('Grovfodret räcker.')
    expect(requests[0]).toMatchObject({ max_tokens: 4000, messages: [{ role: 'user', content: '{"behov":1}' }] })
  })

  it.each([
    ['refusal', 'refusal'],
    ['max_tokens', 'truncated'],
  ])('turns a reply that stopped with %s into %s', async (stopReason, kind) => {
    const { ai } = provider(200, message('Grovfodret', stopReason))
    await expect(ai.explainPlan({})).rejects.toEqual(new AiProviderError(kind as 'refusal'))
  })

  it.each([
    [401, 'authentication_error', new AiProviderError('auth')],
    [429, 'rate_limit_error', new AiProviderError('rate_limit')],
    [529, 'overloaded_error', new AiProviderError('upstream', 529)],
  ])('turns an HTTP %i from Anthropic into a provider error', async (status, type, expected) => {
    const { ai } = provider(status, { type: 'error', error: { type, message: 'x' } })
    const error = await ai.explainPlan({}).catch((e: unknown) => e)
    expect(error).toEqual(expected)
    expect((error as AiProviderError).status).toBe(expected.status)
  })

  it('without a key, fails every call with missing_key and sends nothing', async () => {
    const { ai, requests } = provider(200, message('x'), false)
    await expect(ai.readAnalysis(PDF)).rejects.toEqual(new AiProviderError('missing_key'))
    await expect(ai.explainPlan({})).rejects.toEqual(new AiProviderError('missing_key'))
    expect(requests).toEqual([])
  })
})
