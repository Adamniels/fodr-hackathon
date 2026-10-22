import { describe, expect, it } from 'vitest'
import { costSek } from './metered'

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
