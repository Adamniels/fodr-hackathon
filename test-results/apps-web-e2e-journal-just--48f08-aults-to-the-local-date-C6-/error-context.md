# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: apps/web/e2e/journal.spec.ts >> just after midnight the journal entry defaults to the local date (C6)
- Location: apps/web/e2e/journal.spec.ts:16:1

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  1   | // Shared e2e helpers. Tests drive the UI by role, label and visible text only, and never touch storage,
  2   | // so they keep working when localStorage is replaced by a real backend.
  3   | 
  4   | import { test as base, expect, type Locator, type Page } from '@playwright/test'
  5   | import { mockAi, type AiMock } from './mock-ai'
  6   | 
  7   | /** Start of "now" for every test: dates in the journal and calendar are deterministic. */
  8   | export const FIXED_NOW = new Date('2026-10-15T10:00:00+02:00')
  9   | 
  10  | export const test = base.extend<{ ai: AiMock }>({
  11  |   ai: [
  12  |     async ({ page, context }, use) => {
  13  |       // install, not setFixedTime: time starts at FIXED_NOW but keeps moving, so Date.now() based IDs stay unique.
  14  |       await page.clock.install({ time: FIXED_NOW })
  15  |       const ai = await mockAi(context)
  16  |       await use(ai)
  17  |       expect(ai.unexpected(), 'unmocked /api requests').toEqual([])
  18  |     },
  19  |     { auto: true },
  20  |   ],
  21  | })
  22  | 
  23  | export { expect }
  24  | 
  25  | export type Step = 'Hästen' | 'Analysen' | 'Foderplan' | 'Journal'
  26  | 
  27  | export async function enterDemo(page: Page): Promise<void> {
> 28  |   await page.goto('/')
      |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  29  |   await page.getByRole('button', { name: 'Testa med demohästen' }).first().click()
  30  |   await expect(page.getByText('Mina hästar')).toBeVisible()
  31  | }
  32  | 
  33  | async function openLoginDialog(page: Page): Promise<Locator> {
  34  |   await page.goto('/')
  35  |   await page.getByRole('button', { name: 'Logga in', exact: true }).click()
  36  |   const dialog = page.getByRole('dialog', { name: 'Logga in' })
  37  |   await expect(dialog).toBeVisible()
  38  |   return dialog
  39  | }
  40  | 
  41  | export async function createAccount(page: Page, name: string, email: string): Promise<void> {
  42  |   const dialog = await openLoginDialog(page)
  43  |   await dialog.getByRole('button', { name: 'Ny här? Skapa konto' }).click()
  44  |   await dialog.getByLabel('Namn').fill(name)
  45  |   await dialog.getByLabel('E-post').fill(email)
  46  |   await dialog.getByRole('button', { name: 'Skapa konto', exact: true }).click()
  47  |   await expect(page.getByText('Mina hästar')).toBeVisible()
  48  | }
  49  | 
  50  | /** Submits the login form. Does not wait for the workspace, so failed logins can be asserted. */
  51  | export async function logIn(page: Page, email: string): Promise<void> {
  52  |   const dialog = await openLoginDialog(page)
  53  |   await dialog.getByLabel('E-post').fill(email)
  54  |   await dialog.getByRole('button', { name: 'Logga in', exact: true }).click()
  55  | }
  56  | 
  57  | export async function goToStep(page: Page, step: Step): Promise<void> {
  58  |   await page
  59  |     .getByRole('navigation', { name: 'Steg' })
  60  |     .getByRole('button', { name: new RegExp(`${step}$`) })
  61  |     .click()
  62  | }
  63  | 
  64  | /** Demo account, Sixten, with the built-in complete example analysis, ending on the plan step. */
  65  | export async function loadExamplePlan(page: Page): Promise<void> {
  66  |   await enterDemo(page)
  67  |   await goToStep(page, 'Analysen')
  68  |   await page.getByRole('button', { name: 'Exempel: komplett analys' }).click()
  69  |   await page.getByRole('button', { name: /Räkna fram foderplan/ }).click()
  70  |   await expect(page.getByRole('heading', { name: 'Inköpslista' })).toBeVisible()
  71  | }
  72  | 
  73  | /** Clears a field with the keyboard, then types one key at a time, as a user does (unlike fill). */
  74  | export async function typeKeyByKey(field: Locator, text: string): Promise<void> {
  75  |   await field.click()
  76  |   await field.press('ControlOrMeta+a')
  77  |   await field.press('Backspace')
  78  |   await field.pressSequentially(text)
  79  | }
  80  | 
  81  | /** The sidebar listing the user's horses. */
  82  | export const horseList = (page: Page): Locator => page.getByRole('complementary', { name: 'Hästar' })
  83  | 
  84  | /**
  85  |  * Matches a whole number followed by a unit, e.g. 1 288 kr. Any whitespace (sv-SE uses a no-break space) may
  86  |  * separate thousands. The lookbehind stops 88 from matching inside 188 or 1 288, or after a decimal comma.
  87  |  */
  88  | function amountPattern(value: number, unit: string): RegExp {
  89  |   const digits = String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '\\s')
  90  |   return new RegExp(`(?<![\\d,]\\s?)${digits}\\s*${unit}(?![\\p{L}])`, 'u')
  91  | }
  92  | 
  93  | export async function expectMoney(locator: Locator, kronor: number): Promise<void> {
  94  |   await expect(locator).toContainText(amountPattern(kronor, 'kr'))
  95  | }
  96  | 
  97  | export async function expectGrams(locator: Locator, grams: number): Promise<void> {
  98  |   await expect(locator).toContainText(amountPattern(grams, 'g'))
  99  | }
  100 | 
```