import { createAccountWithHorses, expect, grantAdmin, test } from './support/helpers'

// Product administration (CF9, #36). Each test works on a product of its own, so the catalogue the other tests plan
// with never changes under them.

const UNKNOWN = 'Finns inte i produktdatabasen och räknas inte med'

test('an admin creates a product, edits it, finds it in a feed list, and retires it (CF9)', async ({ page }) => {
  const account = await createAccountWithHorses(page)
  await grantAdmin(page, account)
  const name = `E2E Testfoder ${String(Date.now())}`

  await page.getByRole('link', { name: 'Produkter' }).click()
  await expect(page.getByRole('heading', { name: 'Produkter', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'Ny produkt' }).click()
  await page.getByLabel('Namn').fill(name)
  await page.getByLabel('Märke').fill('Testmärke')
  await page.getByLabel('Butik').fill('Testbutik')
  await page.getByLabel('Kategori').selectOption({ label: 'Tillskott' })
  await page.getByLabel('Pris (kr)').fill('100')
  await page.getByLabel('Förpackning (kg)').fill('2')
  await page.getByLabel('Källa', { exact: true }).fill('Förpackningen')
  await page.getByLabel('Insamlad').fill('2026-10-22')
  await page.getByRole('button', { name: 'Spara produkt' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Sparad' })).toBeVisible()

  // A new version: the list shows the new price.
  await page.getByLabel('Pris (kr)').fill('120')
  await page.getByRole('button', { name: 'Spara produkt' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Sparad' })).toBeVisible()
  await page.getByRole('link', { name: 'Alla produkter' }).click()
  await page.getByLabel('Sök produkt').fill(name)
  await expect(page.getByRole('row').filter({ hasText: name })).toContainText('120')

  // The catalogue the workspace plans with has it: typed into a feed row, it is a known product.
  await page.goto('/horses')
  await page.getByRole('button', { name: '+ Lägg till foder' }).click()
  await page.getByPlaceholder('Sök produkt, t.ex. Krafft').last().fill(name)
  await expect(page.getByRole('combobox', { name: UNKNOWN })).toHaveCount(0)

  // Retired, it leaves the catalogue: the same row is now an unknown feed.
  await page.goto('/admin/products')
  await page.getByLabel('Sök produkt').fill(name)
  await page.getByRole('link', { name }).click()
  await page.getByRole('button', { name: 'Ta ur sortimentet' }).click()
  await expect(page.getByText('Utgått')).toBeVisible()
  await page.goto('/horses')
  await expect(page.getByRole('combobox', { name: UNKNOWN })).toHaveValue(name)
})

test('the form stops a product without a name, or with half a dose, and says why', async ({ page }) => {
  const account = await createAccountWithHorses(page)
  await grantAdmin(page, account)
  await page.goto('/admin/products/new')
  // Only a maximum: a missing minimum is unknown, never 0.
  await page.getByLabel('Dos högst (g per 100 kg och dag)').fill('30')
  await expect(page.getByLabel('Dos minst (g per 100 kg och dag)')).toHaveValue('')
  await page.getByRole('button', { name: 'Spara produkt' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Rätta de markerade fälten.' })).toBeVisible()
  await expect(page.getByText('Ange ett namn.')).toBeVisible()
  await expect(page.getByText('Ange både minsta och högsta dos.')).toBeVisible()
  // Nothing was sent: still the new product's form.
  await expect(page).toHaveURL(/\/admin\/products\/new$/)
})

test('someone who is not an admin finds no product administration', async ({ page }) => {
  await createAccountWithHorses(page)
  await expect(page.getByRole('link', { name: 'Produkter' })).toHaveCount(0)
  await page.goto('/admin/products')
  await expect(page.getByRole('heading', { name: 'Sidan finns inte' })).toBeVisible()
})

// The admin's check that error tracking reaches Sentry (#43). Sentry is off in the tests; what the admin sees is the
// request ID both reports carry, from the API's real answer.
test('an admin sends a test error and is told which request ID to look for in Sentry', async ({ page }) => {
  const account = await createAccountWithHorses(page)
  await grantAdmin(page, account)
  await page.goto('/admin/products')
  await page.getByRole('button', { name: 'Skicka testfel' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Testfelet är skickat' })).toContainText(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
  )
})
