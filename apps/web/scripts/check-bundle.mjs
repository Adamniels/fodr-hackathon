// Fails when the built web app contains the product catalogue (#27): the catalogue comes from the API, so the preview
// plans with the one the server saves plans with (ADR 0004). Run after `npm run build` (the Dockerfile does).
// The landing preview's example horse names the one feed it eats today (data/examples.ts); the catalogue would bring
// all of them.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const here = new URL('.', import.meta.url).pathname
const assets = join(here, '../dist/assets')
const catalogue = JSON.parse(readFileSync(join(here, '../../api/src/data/products.json'), 'utf8'))
const bundle = readdirSync(assets)
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(assets, f), 'utf8'))
  .join('\n')

const found = catalogue.map((p) => p.namn).filter((name) => bundle.includes(name))
const ALLOWED = 2
if (found.length >= ALLOWED) {
  console.error(`The web bundle contains ${found.length} of ${catalogue.length} catalogue products, e.g. ${found[0]}.`)
  process.exit(1)
}
console.log(`Catalogue not in the web bundle (${found.length} product names from example data).`)
