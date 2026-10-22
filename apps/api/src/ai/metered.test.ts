import { describe, expect, it } from 'vitest'
import { fakeAiProvider } from '../../test/fake-ai-provider'
import { createLogger } from '../logger'
import type { UsageRepository } from '../repositories/ai-usage'
import { AiQuotaExceeded, costSek, createMeteredAi } from './metered'
import { AiProviderError } from './provider'

describe('costSek (#31)', () => {
  const prices = { priceSekPerMtokInput: 30, priceSekPerMtokOutput: 150 }

  it('prices input and output tokens per million', () => {
    expect(costSek({ inputTokens: 1_000_000, outputTokens: 0 }, prices)).toBe(30)
    expect(costSek({ inputTokens: 0, outputTokens: 1_000_000 }, prices)).toBe(150)
    expect(costSek({ inputTokens: 1000, outputTokens: 200 }, prices)).toBe(0.06)
  })

  it('rounds to what the column keeps, four decimals', () => {
    expect(costSek({ inputTokens: 1, outputTokens: 1 }, prices)).toBe(0.0002)
    expect(costSek({ inputTokens: 0, outputTokens: 0 }, prices)).toBe(0)
  })
})

// The metering around a call when the usage log itself fails (#31): the owner's call is not lost to it. The database
// behaviour is in usage.integration.test.ts.
describe('createMeteredAi (#31)', () => {
  const config = { model: 'test-model', dailyCallsPerUser: 3, priceSekPerMtokInput: 30, priceSekPerMtokOutput: 150 }
  const broken = () => Promise.reject(new Error('database down'))

  function setup(usage: Partial<UsageRepository>) {
    const logs: { level: number; msg: string }[] = []
    const logger = createLogger('info', { write: (line: string) => void logs.push(JSON.parse(line) as never) })
    const ai = fakeAiProvider()
    ai.answer('interpretProfile', { foljdfragor: [] })
    const metered = createMeteredAi({
      ai,
      usage: {
        reserve: () => Promise.resolve('slot'),
        complete: () => Promise.resolve(),
        release: () => Promise.resolve(),
        ...usage,
      },
      config,
      logger,
    })
    const run = () => metered.run('user', 'profile', (p) => p.interpretProfile({ foderText: 'x' } as never))
    return { ai, logs, run }
  }

  it('answers even when the call cannot be recorded, and logs it', async () => {
    const { logs, run } = setup({ complete: broken })
    await expect(run()).resolves.toEqual({ foljdfragor: [] })
    expect(logs.map((l) => l.msg)).toContain('ai usage not recorded')
  })

  it("keeps the provider's error when a reservation cannot be released", async () => {
    const { ai, logs, run } = setup({ release: broken })
    ai.fail('interpretProfile', new AiProviderError('missing_key'))
    await expect(run()).rejects.toMatchObject({ kind: 'missing_key' })
    expect(logs.map((l) => l.msg)).toContain('ai usage not released')
  })

  it('logs a used quota, without calling the model', async () => {
    const { ai, logs, run } = setup({ reserve: () => Promise.resolve(null) })
    await expect(run()).rejects.toBeInstanceOf(AiQuotaExceeded)
    expect(ai.calls).toEqual([])
    expect(logs).toContainEqual(expect.objectContaining({ msg: 'ai quota used', route: 'profile' }))
  })
})
