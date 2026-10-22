// Recreates a throwaway database on the Compose Postgres and applies every migration: the integration tests use
// fodr_test (integration-setup.ts), the web app's e2e tests fodr_e2e (e2e-database.ts). Only the database name
// differs from DATABASE_URL, so the development data is untouched.
import pg from 'pg'
import { loadCatalogueFile } from '../src/catalogue-file'
import { createDatabase, migrateDatabase } from '../src/db'
import { productRepository } from '../src/repositories/products'

/** Returns the URL of the fresh, migrated database; with `withCatalogue`, the catalogue file is imported (#35). */
export async function recreateDatabase(
  adminUrl: string,
  name: string,
  { withCatalogue = false }: { withCatalogue?: boolean } = {},
): Promise<string> {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Not a plain database name: ${name}`)
  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  const admin = new pg.Client({ connectionString: adminUrl })
  try {
    await admin.connect()
  } catch (e) {
    throw new Error(`Cannot reach Postgres at ${new URL(adminUrl).host}; start it with \`docker compose up --wait\`.`, {
      cause: e,
    })
  }
  try {
    await admin.query(`drop database if exists ${name} with (force)`)
    await admin.query(`create database ${name}`)
  } finally {
    await admin.end()
  }
  await migrateDatabase(url.href)
  if (withCatalogue) {
    const database = createDatabase(url.href)
    try {
      await productRepository(database.db).importCatalogue(loadCatalogueFile())
    } finally {
      await database.close()
    }
  }
  return url.href
}
