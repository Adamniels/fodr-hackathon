// Shared e2e helpers. Tests drive the UI by role, label and visible text only, and never touch storage,
// so they keep working when localStorage is replaced by a real backend.

import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { mockAi, type AiMock } from './mock-ai'

/** Fixed "now" for every test: dates in the journal and calendar are deterministic. */
export const FIXED_NOW = new Date('2026-10-15T10:00:00+02:00')

export const test = base.extend<{ ai: AiMock }>({
  ai: [
    async ({ page }, use) => {
      await page.clock.setFixedTime(FIXED_NOW)
      const ai = await mockAi(page)
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

export async function createAccount(page: Page, name: string, email: string): Promise<void> {
  const dialog = await openLoginDialog(page)
  await dialog.getByRole('button', { name: 'Ny här? Skapa konto' }).click()
  await dialog.getByLabel('Namn').fill(name)
  await dialog.getByLabel('E-post').fill(email)
  await dialog.getByRole('button', { name: 'Skapa konto', exact: true }).click()
  await expect(page.getByText('Mina hästar')).toBeVisible()
}

/** Submits the login form. Does not wait for the workspace, so failed logins can be asserted. */
export async function logIn(page: Page, email: string): Promise<void> {
  const dialog = await openLoginDialog(page)
  await dialog.getByLabel('E-post').fill(email)
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
