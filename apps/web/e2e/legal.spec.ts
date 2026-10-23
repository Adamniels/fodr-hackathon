import type { Page } from '@playwright/test'
import {
  createAccountWithHorses,
  expect,
  grantAdmin,
  PASSWORD,
  setTermsVersion,
  showExamplePlan,
  test,
} from './support/helpers'
import { expectAccessible } from './support/accessibility'
import { uniqueEmail } from './support/mailpit'

// The beta terms, the privacy notice and the plan disclaimer (#42).

const CONSENT = 'Jag godkänner villkoren och har läst integritetspolicyn'

async function signUpDialog(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Logga in', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Logga in' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Ny här? Skapa konto' }).click()
  return dialog
}

test('signing up needs the terms accepted, and links to both texts', async ({ page }) => {
  const dialog = await signUpDialog(page)
  await dialog.getByLabel('Namn').fill('Utan Villkor')
  await dialog.getByLabel('E-post').fill(uniqueEmail('utan-villkor'))
  await dialog.getByLabel('Lösenord').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Skapa konto', exact: true }).click()
  await expect(dialog.getByText('Godkänn villkoren för att skapa ett konto.')).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Kolla din e-post' })).toHaveCount(0)

  await expect(dialog.getByLabel(CONSENT)).not.toBeChecked()
  await expect(dialog.getByRole('link', { name: 'villkoren' })).toHaveAttribute('href', '/villkor')
  await expect(dialog.getByRole('link', { name: 'integritetspolicyn' })).toHaveAttribute('href', '/integritet')
})

test('the terms and the privacy notice can be read from the start page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Villkor' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Villkor för Fodr' })).toBeVisible()
  await page.goto('/')
  await page.getByRole('link', { name: 'Integritetspolicy' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Integritetspolicy' })).toBeVisible()
  // The privacy notice says that what is written about the horse is sent to the AI provider.
  await expect(page.getByText(/Anthropic/).first()).toBeVisible()
})

test('every plan says it is decision support and refers to a vet', async ({ page }) => {
  await createAccountWithHorses(page)
  await showExamplePlan(page)
  await expect(page.getByText(/Foderplanen är ett beslutsstöd, inte veterinärrådgivning/)).toBeVisible()
})

test('an account on older terms accepts the new ones before the workspace', async ({ page }) => {
  const account = await createAccountWithHorses(page)
  await setTermsVersion(account, '2020-01-01')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Nya villkor' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Sixten' })).toHaveCount(0)
  await expectAccessible(page, 'new terms screen')
  await page.getByLabel(CONSENT).check()
  await page.getByRole('button', { name: 'Godkänn och fortsätt' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sixten' })).toBeVisible()
  // Accepted for good: a reload goes straight to the workspace.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Sixten' })).toBeVisible()
})

test('the new-terms screen still lets a user leave: export, delete or log out', async ({ page }) => {
  const account = await createAccountWithHorses(page)
  await setTermsVersion(account, '2020-01-01')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Nya villkor' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Exportera mina data' })).toHaveAttribute('href', '/api/v1/me/export')
  await expect(page.getByRole('button', { name: 'Radera mitt konto' })).toBeVisible()
  await page.getByRole('button', { name: 'Logga ut' }).click()
  await expect(page.getByRole('heading', { name: 'Nya villkor' })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Logga in' })).toBeVisible()
})

test('a failed log out on the new-terms screen says so, and logging out again ends the session (#169)', async ({
  page,
}) => {
  const account = await createAccountWithHorses(page)
  await setTermsVersion(account, '2020-01-01')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Nya villkor' })).toBeVisible()
  // /api/auth belongs to the real backend and is otherwise never intercepted; only a stubbed answer can make the
  // sign-out fail.
  await page.route('**/api/auth/sign-out', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  )
  await page.getByRole('button', { name: 'Logga ut' }).click()
  const failed = page.getByRole('alert').filter({ hasText: 'Utloggningen misslyckades' })
  await expect(failed).toContainText('Du är fortfarande inloggad.')
  await expect(page.getByRole('heading', { name: 'Nya villkor' })).toBeVisible()
  await expectAccessible(page, 'failed log out on the new-terms screen')

  await page.unroute('**/api/auth/sign-out')
  await failed.getByRole('button', { name: 'Försök igen' }).click()
  await expect(page.getByRole('dialog', { name: 'Logga in' })).toBeVisible()
})

test('the product administration waits for the new terms too', async ({ page }) => {
  const account = await createAccountWithHorses(page)
  await grantAdmin(page, account)
  await setTermsVersion(account, '2020-01-01')
  await page.goto('/admin/products')
  await expect(page.getByRole('heading', { name: 'Nya villkor' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Produkter' })).toHaveCount(0)
})
