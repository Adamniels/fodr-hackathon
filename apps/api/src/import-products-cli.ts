// `npm run products:import` (and `node apps/api/dist/import-products.mjs` in the image): mirrors the catalogue file
// (data/products.json) into the database's product tables (#35, repositories/products.ts). Run after migrating, before
// the API starts: the API refuses to run without a catalogue. Safe to run again: an unchanged file changes nothing.
import { z } from 'zod'
import { loadCatalogueFile } from './catalogue-file'
import { createDatabase } from './db'
import { productRepository } from './repositories/products'

const Env = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }),
})
const parsed = Env.safeParse(process.env)
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')} ${i.message}`)
  process.stderr.write(['Invalid import configuration:', ...issues].join('\n') + '\n')
  process.exit(1)
}

const database = createDatabase(parsed.data.DATABASE_URL)
let exitCode = 0
try {
  const catalogue = loadCatalogueFile()
  const r = await productRepository(database.db).importCatalogue(catalogue)
  process.stdout.write(
    `${String(catalogue.length)} products in the file: ${String(r.added)} added, ${String(r.changed)} changed, ` +
      `${String(r.retired)} retired, ${String(r.restored)} back, ${String(r.kept)} kept as an admin left them. ` +
      (r.setId ? `New product set ${r.setId}.\n` : 'Nothing changed; the product set stays.\n'),
  )
} catch (e) {
  exitCode = 1
  const kind = e instanceof Error ? e.constructor.name : typeof e
  process.stderr.write(`Import failed (${kind}): ${e instanceof Error ? e.message : String(e)}. Nothing changed.\n`)
} finally {
  await database.close()
}
process.exit(exitCode)
