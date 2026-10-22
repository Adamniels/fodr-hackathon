// Global setup for the integration tests: recreates fodr_test and migrates it (database.ts), then hands its URL to the
// tests (inject('databaseUrl')). Uses DATABASE_URL from the environment or the root .env, else the compose.yaml defaults.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { TestProject } from 'vitest/node'
import { createFileStore } from '../src/storage'
import { recreateDatabase } from './database'
import { testS3Config } from './s3'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

const TEST_DATABASE = 'fodr_test'
const ROOT_ENV = fileURLToPath(new URL('../../../.env', import.meta.url))

export default async function setup(project: TestProject) {
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV)
  const adminUrl = process.env.DATABASE_URL ?? 'postgres://fodr:fodr@127.0.0.1:5432/fodr'
  const testUrl = await recreateDatabase(adminUrl, TEST_DATABASE)
  project.provide('databaseUrl', testUrl)
  await createFileStore(testS3Config()).ensureBucket()
}
