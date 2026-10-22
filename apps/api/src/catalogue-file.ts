// The generated catalogue file (#27, #35): built from store data by apps/web/scripts/import-products.mjs and
// scripts/produktval.json, and reviewed in the PR that changes it. Only the import (import-products-cli.ts) and the
// tests read it; the API plans from the catalogue in the database (products.ts).
import type { Produkt } from '@fodr/domain/types'
import catalogue from './data/products.json'

export function loadCatalogueFile(): Produkt[] {
  return catalogue as Produkt[]
}
