// Bundles the API for production: dist/main.mjs (the server), dist/migrate.mjs, dist/seed.mjs (#29) and
// dist/import-products.mjs (#35, with the catalogue file) and dist/admin.mjs (#36), each one file with every dependency
// and the workspace packages inlined, so the image runs them with plain node and no node_modules.
import { execFileSync } from 'node:child_process'
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
  // CommonJS dependencies (pg, pino) call require, which an ES module bundle lacks. The import has a name of its own:
  // a bundled package that imports createRequire itself (fflate, #40) must not meet a second declaration of it.
  banner: {
    js: "import { createRequire as bannerCreateRequire } from 'node:module'; const require = bannerCreateRequire(import.meta.url);",
  },
  // .mjs: an ES module without a package.json beside it, as in the image.
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
})

// Each bundle must at least parse: a clash between bundled code and the banner only shows when node loads the file,
// which nothing else here does before the image runs it (#40).
for (const name of ['main', 'migrate', 'seed', 'import-products', 'admin']) {
  execFileSync(process.execPath, ['--check', `dist/${name}.mjs`], { stdio: 'inherit' })
}
