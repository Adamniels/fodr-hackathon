// The product catalogue the engine plans with (#27): generated from store data by
// apps/web/scripts/import-products.mjs, bundled with the API and served to the browser for its previews. The version
// names the exact catalogue a saved plan chose from (CF5): a hash of its content, until versioned product tables
// replace the file (#35).
import { createHash } from 'node:crypto'
import type { Produkt } from '@fodr/domain/types'
import catalogue from './data/products.json'

export interface Catalogue {
  version: string
  products: Produkt[]
}

export function loadCatalogue(): Catalogue {
  const products = catalogue as Produkt[]
  const version = createHash('sha256').update(JSON.stringify(products)).digest('hex').slice(0, 16)
  return { version, products }
}
