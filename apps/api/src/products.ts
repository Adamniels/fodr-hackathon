// The product catalogue the engine plans with (#27, #35): the newest product set in the database
// (repositories/products.ts), served to the browser for its previews and used by the server for every saved plan and
// to link the products the AI names. The version is the set's ID, which a saved plan records (CF5). Each request reads
// which set is newest, and the products are read again only when it changed, so an import or an admin's edit
// (#36) shows at once without a restart.
import type { Produkt } from '@fodr/domain/types'
import type { ProductRepository } from './repositories/products'

export interface Catalogue {
  version: string
  products: Produkt[]
}

export interface CatalogueSource {
  /** The catalogue to plan with now. */
  current(): Promise<Catalogue>
}

/** There is no product set: the import has not run (the API refuses to start then, server.ts). */
export class NoCatalogue extends Error {
  constructor() {
    super('no product catalogue: run npm run products:import')
    this.name = 'NoCatalogue'
  }
}

export function databaseCatalogue(repository: Pick<ProductRepository, 'currentSetId' | 'products'>): CatalogueSource {
  let cached: Promise<Catalogue> | undefined
  let cachedVersion: string | undefined
  return {
    async current() {
      const version = await repository.currentSetId()
      if (version === null) throw new NoCatalogue()
      if (version !== cachedVersion || !cached) {
        cachedVersion = version
        // Shared by requests that arrive while it loads; dropped on failure, so the next request reads it again.
        cached = repository.products(version).then((products) => ({ version, products }))
        cached.catch(() => {
          if (cachedVersion === version) cached = undefined
        })
      }
      return cached
    },
  }
}

/** A fixed catalogue, for tests without a database. */
export function staticCatalogue(catalogue: Catalogue): CatalogueSource {
  return { current: () => Promise.resolve(catalogue) }
}
