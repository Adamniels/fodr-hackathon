// Shared e2e helpers. Tests drive the UI by role, label and visible text only, and never touch storage,
// so they keep working when localStorage is replaced by a real backend.

import { createHash } from 'node:crypto'
import { test as base, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { E2E_WEB, linkIn, uniqueEmail, waitForMail } from './mailpit'
import { mockAi, type AiMock } from './mock-ai'

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

export const test = base.extend<{ ai: AiMock }>({
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

export async function enterDemo(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Testa med demohästen' }).first().click()
  await expect(page.getByText('Mina hästar')).toBeVisible()
}

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

/** Demo account, Sixten, with the built-in complete example analysis, ending on the plan step. */
export async function loadExamplePlan(page: Page): Promise<void> {
  await enterDemo(page)
  await goToStep(page, 'Analysen')
  await page.getByRole('button', { name: 'Exempel: komplett analys' }).click()
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
