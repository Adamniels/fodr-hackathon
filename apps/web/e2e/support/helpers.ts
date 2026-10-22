// Shared e2e helpers. Tests drive the UI by role, label and visible text only, and never touch browser storage; the
// data is on the real backend, and accounts come from sign-up (createAccount) or the seed (seededAccount).

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { test as base, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import type { ExplanationRequest } from '@fodr/contracts/ai'
import type { HorseProfile } from '@fodr/contracts/horses'
import { basicReading, completeReading } from '../fixtures/ai'
import { PYSEN, SIXTEN } from '../fixtures/horses'
import { createDatabase, type Database } from '../../../api/src/db'
import { seedDemo } from '../../../api/src/seed'
import { reportWith } from './reports'
import { E2E_WEB, linkIn, uniqueEmail, waitForMail } from './mailpit'
import { mockAi, type AiMock } from './mock-ai'

/** The e2e run's database, as playwright.config.ts gives it to the API; the seed writes to it. */
const E2E_DATABASE_URL = `postgres://fodr:fodr@127.0.0.1:${process.env.POSTGRES_PORT ?? '5432'}/fodr_e2e`
/** The API package and its seed script, found from this file so the tests can run from any directory. */
const API_DIR = fileURLToPath(new URL('../../../api/', import.meta.url))
const SEED_CLI = fileURLToPath(new URL('../../../api/src/seed-cli.ts', import.meta.url))
const ADMIN_CLI = fileURLToPath(new URL('../../../api/src/admin-cli.ts', import.meta.url))

// One database pool per test worker for the seed, opened when a test first seeds and closed when the worker ends
// (the seedDatabase fixture below).
let seedDatabase: Database | undefined
// An idle connection the server drops is replaced by the pool; createDatabase's default listener keeps it from ending
// the worker.
const seedDb = () => (seedDatabase ??= createDatabase(E2E_DATABASE_URL)).db

/** The password every e2e account gets. */
export const PASSWORD = 'e2e-losenord-123'

/**
 * A client IP of the test's own (and of each retry), sent on every request: the e2e API trusts this header like a
 * proxy's (playwright.config.ts), so the auth rate limits key on the test and one test's logins never block another's.
 */
function clientIpFor(testInfo: TestInfo): string {
  const [a, b, c] = createHash('sha256')
    .update(`${testInfo.testId}:${String(testInfo.retry)}`)
    .digest()
  return `10.${String(a)}.${String(b)}.${String(c)}`
}

/** Start of "now" for every test: dates in the journal and calendar are deterministic. */
export const FIXED_NOW = new Date('2026-10-15T10:00:00+02:00')

/** The seed's "today" in the tests: the calendar day of FIXED_NOW in Sweden. */
const SEED_TODAY = FIXED_NOW.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })

/** The client IP header of the running test, for a browser context the test opens itself. */
export const clientIpHeaders = (): Record<string, string> => ({ 'x-e2e-client-ip': clientIpFor(base.info()) })

export const test = base.extend<{ ai: AiMock }, { seedDatabase: null }>({
  // Closes the seed's database pool, if a test of this worker opened it, when the worker ends.
  seedDatabase: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this destructuring
    async ({}, provide) => {
      await provide(null)
      await seedDatabase?.close()
      seedDatabase = undefined
    },
    { scope: 'worker', auto: true },
  ],
  // `provide` rather than Playwright's usual `use`, which the React hooks lint rule takes for React's use().
  // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this destructuring
  extraHTTPHeaders: async ({}, provide, testInfo) => {
    await provide({ 'x-e2e-client-ip': clientIpFor(testInfo) })
  },
  ai: [
    async ({ page, context }, use) => {
      // install, not setFixedTime: time starts at FIXED_NOW but keeps moving, so Date.now() based IDs stay unique.
      await page.clock.install({ time: FIXED_NOW })
      const ai = await mockAi(context)
      await use(ai)
      expect(ai.unexpected(), 'unmocked /api requests').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export type Step = 'Hästen' | 'Analysen' | 'Foderplan' | 'Journal'

async function openLoginDialog(page: Page): Promise<Locator> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Logga in', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Logga in' })
  await expect(dialog).toBeVisible()
  return dialog
}

export interface Account {
  email: string
  password: string
}

/**
 * A verified account, signed in: signs up through the API and opens the verification link from Mailpit, as a user
 * does from their inbox. The address gets a unique suffix (agare@example.se becomes agare+abc123@example.se), so
 * retries and earlier runs never collide. The sign-up screens themselves are tested in landing-and-account.spec.ts.
 */
export async function createAccount(page: Page, name: string, email: string): Promise<Account> {
  const account = { email: uniqueEmail(email.split('@')[0]), password: PASSWORD }
  const res = await page.request.post('/api/auth/sign-up/email', {
    data: { name, email: account.email, password: account.password, callbackURL: '/login' },
    headers: { origin: E2E_WEB },
  })
  expect(res.ok(), await res.text()).toBe(true)
  await page.goto(linkIn(await waitForMail(account.email, /Bekräfta/)))
  await expect(page.getByText('Mina hästar')).toBeVisible()
  return account
}

/**
 * A verified, signed-in account with horses, Sixten and Pysen by default, ending on the first horse's profile. The
 * horses are created through the API (POST /api/v1/horses with the page's session cookie); adding a horse through the
 * UI is tested on its own in horse-profile.spec.ts.
 */
export async function createAccountWithHorses(
  page: Page,
  horses: HorseProfile[] = [SIXTEN, PYSEN],
  email = 'agare@example.se',
): Promise<Account> {
  const account = await createAccount(page, 'Hästägare', email)
  for (const horse of horses) {
    const res = await page.request.post('/api/v1/horses', { data: horse })
    expect(res.status(), await res.text()).toBe(201)
  }
  await page.goto('/horses')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(horses[0].namn)
  return account
}

/**
 * The demo account of `npm run seed` (#29), seeded for this test alone: Sixten with the complete example analysis and a
 * journal, and Pysen, journal dates counted back from FIXED_NOW. Runs the real seed script against the e2e database,
 * then logs in through the UI and ends on Sixten's profile.
 */
export async function seededAccount(page: Page, email = 'demo@example.se'): Promise<Account> {
  const account = { email: uniqueEmail(email.split('@')[0]), password: PASSWORD }
  // The seed itself, in this process: a run of the CLI per test would start node and compile TypeScript each time
  // (#146). The CLI is tested on its own (seedWithCli).
  await seedDemo(seedDb(), { ...account, name: 'Demo', today: SEED_TODAY })
  await logIn(page, account.email)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sixten')
  return account
}

/**
 * Makes the account an admin (#36) with the real `npm run admin:grant` script, as an operator would, and reloads the
 * page so the session's role is read again.
 */
export async function grantAdmin(page: Page, account: Account): Promise<void> {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--import', 'tsx', ADMIN_CLI, 'grant', account.email],
    {
      cwd: API_DIR,
      env: { PATH: process.env.PATH, DATABASE_URL: E2E_DATABASE_URL },
    },
  )
  expect(stdout).toContain(`${account.email} is now an admin.`)
  await page.reload()
}

/** Runs `npm run seed`'s script for a new account, as an operator would, and returns the account (#29). */
export async function seedWithCli(email: string): Promise<Account & { output: string }> {
  const account = { email: uniqueEmail(email.split('@')[0]), password: PASSWORD }
  // Only what the seed needs, so nothing from the shell (a SEED_NAME, NODE_OPTIONS) changes what a test sees.
  const { stdout } = await promisify(execFile)(process.execPath, ['--import', 'tsx', SEED_CLI], {
    cwd: API_DIR,
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: E2E_DATABASE_URL,
      SEED_EMAIL: account.email,
      SEED_PASSWORD: account.password,
      SEED_NAME: 'Demo',
      SEED_TODAY,
    },
  })
  return { ...account, output: stdout }
}

/** Submits the login form with a password. Does not wait for the workspace, so failed logins can be asserted. */
export async function logIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  const dialog = await openLoginDialog(page)
  await dialog.getByLabel('E-post').fill(email)
  await dialog.getByLabel('Lösenord').fill(password)
  await dialog.getByRole('button', { name: 'Logga in', exact: true }).click()
}

export async function goToStep(page: Page, step: Step): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Steg' })
    .getByRole('button', { name: new RegExp(`${step}$`) })
    .click()
}

/** A seeded account (seededAccount), Sixten's plan from his complete analysis, ending on the plan step. */
export async function loadExamplePlan(page: Page): Promise<void> {
  await seededAccount(page)
  await goToStep(page, 'Analysen')
  await page.getByRole('button', { name: /Räkna fram foderplan/ }).click()
  await expect(page.getByRole('heading', { name: 'Inköpslista' })).toBeVisible()
}

/**
 * The plan explanations the page asks the API to write from now on (#32): the body of each POST to a plan's
 * explanation, in order. Reading a stored explanation is a GET, which is not listed.
 */
export function explanationRequests(page: Page): { request: ExplanationRequest; regenerate?: boolean }[] {
  const sent: { request: ExplanationRequest; regenerate?: boolean }[] = []
  page.on('request', (r) => {
    if (
      r.method() === 'POST' &&
      /^\/api\/v1\/horses\/[^/]+\/plans\/[^/]+\/explanation$/.test(new URL(r.url()).pathname)
    )
      sent.push(r.postDataJSON() as (typeof sent)[number])
  })
  return sent
}

/** On the analysis step, uploads a report the AI reads as the complete (or basic) example analysis. */
export async function uploadExample(page: Page, which: 'complete' | 'basic' = 'complete'): Promise<void> {
  const reading = which === 'complete' ? completeReading : basicReading
  await page.getByLabel(/Välj analysrapport/).setInputFiles(reportWith(reading))
  await expect(page.getByLabel('Torrsubstans')).toHaveValue(String(reading.tsProcent))
}

/** From the selected horse, uploads the complete example analysis and ends on the plan step. */
export async function showExamplePlan(page: Page): Promise<void> {
  await goToStep(page, 'Analysen')
  await uploadExample(page)
  await page.getByRole('button', { name: /Räkna fram foderplan/ }).click()
  await expect(page.getByRole('heading', { name: 'Inköpslista' })).toBeVisible()
}

/** Clears a field with the keyboard, then types one key at a time, as a user does (unlike fill). */
export async function typeKeyByKey(field: Locator, text: string): Promise<void> {
  await field.click()
  await field.press('ControlOrMeta+a')
  await field.press('Backspace')
  await field.pressSequentially(text)
}

/** The sidebar listing the user's horses. */
export const horseList = (page: Page): Locator => page.getByRole('complementary', { name: 'Hästar' })

/**
 * Matches a whole number followed by a unit, e.g. 1 288 kr. Any whitespace (sv-SE uses a no-break space) may
 * separate thousands. The lookbehind stops 88 from matching inside 188 or 1 288, or after a decimal comma.
 */
function amountPattern(value: number, unit: string): RegExp {
  const digits = String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '\\s')
  return new RegExp(`(?<![\\d,]\\s?)${digits}\\s*${unit}(?![\\p{L}])`, 'u')
}

export async function expectMoney(locator: Locator, kronor: number): Promise<void> {
  await expect(locator).toContainText(amountPattern(kronor, 'kr'))
}

export async function expectGrams(locator: Locator, grams: number): Promise<void> {
  await expect(locator).toContainText(amountPattern(grams, 'g'))
}
