// An AiProvider for tests: records each call and answers with what the test set, or throws what it set.
import type { AiProvider } from '../src/ai/provider'

type Method = keyof AiProvider

export interface FakeAiProvider extends AiProvider {
  calls: { method: Method; input: unknown }[]
  answer(method: Method, value: unknown): void
  fail(method: Method, error: Error): void
  /** Forgets the calls, answers and failures. */
  reset(): void
}

/** The tokens every fake answer reports. */
export const FAKE_USAGE = { inputTokens: 1000, outputTokens: 200 }

export function fakeAiProvider(): FakeAiProvider {
  const answers = new Map<Method, unknown>()
  const failures = new Map<Method, Error>()
  const calls: FakeAiProvider['calls'] = []
  const handle = (method: Method) => (input: unknown) => {
    calls.push({ method, input })
    const failure = failures.get(method)
    if (failure) return Promise.reject(failure)
    // Every answer used a few tokens, so the usage log and its cost have something to record (#31).
    return Promise.resolve({ value: answers.get(method), usage: FAKE_USAGE } as never)
  }
  return {
    calls,
    answer: (method, value) => answers.set(method, value),
    fail: (method, error) => failures.set(method, error),
    reset: () => {
      calls.length = 0
      answers.clear()
      failures.clear()
    },
    readAnalysis: handle('readAnalysis'),
    interpretProfile: handle('interpretProfile'),
    explainPlan: handle('explainPlan'),
    analyzeJournal: handle('analyzeJournal'),
  }
}
