// Bundles the API for production: dist/main.mjs (the server), dist/migrate.mjs, dist/seed.mjs (#29) and
// dist/import-products.mjs (#35, with the catalogue file) and dist/admin.mjs (#36), each one file with every dependency
// and the workspace packages inlined, so the image runs them with plain node and no node_modules.
import { build } from 'esbuild'

await build({
  entryPoints: [
    { in: 'src/main.ts', out: 'main' },
    { in: 'src/migrate.ts', out: 'migrate' },
    { in: 'src/seed-cli.ts', out: 'seed' },
    { in: 'src/import-products-cli.ts', out: 'import-products' },
    { in: 'src/admin-cli.ts', out: 'admin' },
  ],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  // pg loads its optional native binding only when asked for; it is not installed.
  external: ['pg-native'],
  // CommonJS dependencies (pg, pino) call require, which an ES module bundle lacks.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  // .mjs: an ES module without a package.json beside it, as in the image.
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
})
