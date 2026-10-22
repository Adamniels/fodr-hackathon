import { describe, expect, it } from 'vitest'
import { createLogger } from './logger'
import { requireCatalogue } from './server'

// The API refuses to run without a product catalogue (#35), once its database answers.
describe('requireCatalogue', () => {
  const logs: { level: number; msg: string }[] = []
  const logger = createLogger('info', { write: (line: string) => void logs.push(JSON.parse(line) as never) })

  it('exits with the import command when the database has no product set', async () => {
    const exits: number[] = []
    await requireCatalogue({ currentSetId: () => Promise.resolve(null) }, logger, { exit: (c) => void exits.push(c) })
    expect(exits).toEqual([1])
    expect(logs.map((l) => l.msg)).toContain('no product catalogue: run npm run products:import')
  })

  it('keeps running when there is a set, and retries while the database does not answer', async () => {
    const exits: number[] = []
    let calls = 0
    const currentSetId = () =>
      ++calls === 1
        ? Promise.reject(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))
        : Promise.resolve('set')
    await requireCatalogue({ currentSetId }, logger, { exit: (c) => void exits.push(c), retryMs: 1 })
    expect(calls).toBe(2)
    expect(exits).toEqual([])
  })

  it('exits on a database error that retrying will not clear, such as a missing table', async () => {
    const exits: number[] = []
    // As Drizzle wraps it: the driver's error, with its Postgres code, as the cause.
    const missing = Object.assign(new Error('Failed query'), { cause: { code: '42P01' } })
    await requireCatalogue({ currentSetId: () => Promise.reject(missing) }, logger, {
      exit: (c) => void exits.push(c),
      retryMs: 1,
    })
    expect(exits).toEqual([1])
  })
})
