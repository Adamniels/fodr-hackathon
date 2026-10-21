// Bundles the API for production: dist/main.mjs (the server) and dist/migrate.mjs, each one file with every dependency
// and the workspace packages inlined, so the image runs them with plain node and no node_modules.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/main.ts', 'src/migrate.ts'],
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
