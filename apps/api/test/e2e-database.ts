// Run by the web app's Playwright setup (apps/web/playwright.config.ts) before it starts the API: recreates the e2e
// database, fodr_e2e, migrates it and imports the catalogue (#35), so every e2e run starts from no accounts. DATABASE_URL names the server and
// credentials (the compose.yaml defaults otherwise); the database name is always fodr_e2e.
import { recreateDatabase } from './database'

const adminUrl = new URL(process.env.DATABASE_URL ?? 'postgres://fodr:fodr@127.0.0.1:5432/fodr')
adminUrl.pathname = '/fodr'
await recreateDatabase(adminUrl.href, 'fodr_e2e', { withCatalogue: true })
process.stdout.write('fodr_e2e recreated, migrated and given the catalogue.\n')
