// An AiProvider for tests: records each call and answers with what the test set, or throws what it set.
import type { AiProvider } from '../src/ai/provider'

type Method = keyof AiProvider

export interface FakeAiProvider extends AiProvider {
  calls: { method: Method; input: unknown }[]
  answer(method: Method, value: unknown): void
  fail(method: Method, error: Error): void
}

export function fakeAiProvider(): FakeAiProvider {
  const answers = new Map<Method, unknown>()
  const failures = new Map<Method, Error>()
  const calls: FakeAiProvider['calls'] = []
  const handle = (method: Method) => (input: unknown) => {
    calls.push({ method, input })
    const failure = failures.get(method)
    if (failure) return Promise.reject(failure)
    return Promise.resolve(answers.get(method) as never)
  }
  return {
    calls,
    answer: (method, value) => answers.set(method, value),
    fail: (method, error) => failures.set(method, error),
    readAnalysis: handle('readAnalysis'),
    interpretProfile: handle('interpretProfile'),
    explainPlan: handle('explainPlan'),
    analyzeJournal: handle('analyzeJournal'),
  }
}
