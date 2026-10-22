import type { Produkt } from '@fodr/domain/types'
import { describe, expect, it } from 'vitest'
import { databaseCatalogue, NoCatalogue } from './products'

// The catalogue read per request (#35): reloaded only when the newest set changes, shared while it loads, and never
// stuck on a failed load.
describe('databaseCatalogue', () => {
  const product = { id: 'p1' } as Produkt

  function fake(setIds: (string | null)[], loads: (() => Promise<Produkt[]>)[]) {
    const calls = { products: 0 }
    let set = 0
    let load = 0
    return {
      calls,
      repository: {
        currentSetId: () => Promise.resolve(setIds[Math.min(set++, setIds.length - 1)]),
        products: () => {
          calls.products++
          return loads[Math.min(load++, loads.length - 1)]()
        },
      },
    }
  }

  it('reads the products once per set, and again when the set changes', async () => {
    const { repository, calls } = fake(['a', 'a', 'b'], [() => Promise.resolve([product])])
    const catalogue = databaseCatalogue(repository)
    expect(await catalogue.current()).toEqual({ version: 'a', products: [product] })
    await catalogue.current()
    expect(calls.products).toBe(1)
    expect((await catalogue.current()).version).toBe('b')
    expect(calls.products).toBe(2)
  })

  it('shares one load between requests that arrive together', async () => {
    const { repository, calls } = fake(['a'], [() => Promise.resolve([product])])
    const catalogue = databaseCatalogue(repository)
    await Promise.all([catalogue.current(), catalogue.current(), catalogue.current()])
    expect(calls.products).toBe(1)
  })

  it('reads again after a failed load, rather than keeping the failure', async () => {
    const { repository } = fake(
      ['a'],
      [() => Promise.reject(new Error('connection lost')), () => Promise.resolve([product])],
    )
    const catalogue = databaseCatalogue(repository)
    await expect(catalogue.current()).rejects.toThrow('connection lost')
    expect(await catalogue.current()).toEqual({ version: 'a', products: [product] })
  })

  it('says there is no catalogue before the first import', async () => {
    const { repository } = fake([null], [() => Promise.resolve([])])
    await expect(databaseCatalogue(repository).current()).rejects.toBeInstanceOf(NoCatalogue)
  })
})
