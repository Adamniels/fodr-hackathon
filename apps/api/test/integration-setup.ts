// Global setup for the integration tests: recreates the test database on the Compose Postgres and applies every
// migration, then hands its URL to the tests (inject('databaseUrl')). Uses DATABASE_URL from the environment or the
// root .env, else the compose.yaml defaults; only the database name changes, so the development data is untouched.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import type { TestProject } from 'vitest/node'
import { migrateDatabase } from '../src/db'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

const TEST_DATABASE = 'fodr_test'
const ROOT_ENV = fileURLToPath(new URL('../../../.env', import.meta.url))

export default async function setup(project: TestProject) {
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV)
  const adminUrl = new URL(process.env.DATABASE_URL ?? 'postgres://fodr:fodr@127.0.0.1:5432/fodr')
  const testUrl = new URL(adminUrl)
  testUrl.pathname = `/${TEST_DATABASE}`

  const admin = new pg.Client({ connectionString: adminUrl.href })
  try {
    await admin.connect()
  } catch (e) {
    throw new Error(`Cannot reach Postgres at ${adminUrl.host}; start it with \`docker compose up --wait\`.`, {
      cause: e,
    })
  }
  try {
    await admin.query(`drop database if exists ${TEST_DATABASE} with (force)`)
    await admin.query(`create database ${TEST_DATABASE}`)
  } finally {
    await admin.end()
  }
  await migrateDatabase(testUrl.href)
  project.provide('databaseUrl', testUrl.href)
}
