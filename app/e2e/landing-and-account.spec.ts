import { createAccount, enterDemo, expect, horseList, logIn, test } from './support/helpers'

test('landing page offers the demo and login', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /Rätt foder till din häst/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Testa med demohästen' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Logga in', exact: true })).toBeVisible()
})

test('demo account opens with Sixten and Pysen', async ({ page }) => {
  await enterDemo(page)
  await expect(horseList(page).getByRole('button', { name: 'Sixten' })).toBeVisible()
  await expect(horseList(page).getByRole('button', { name: 'Pysen' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sixten')
})

test('create account, log out, log in again', async ({ page }) => {
  await createAccount(page, 'E2E Test', 'e2e@example.se')
  await expect(horseList(page).getByText('E2E Test')).toBeVisible()

  await horseList(page).getByRole('button', { name: 'Logga ut' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Rätt foder till din häst/ })).toBeVisible()

  await logIn(page, 'e2e@example.se')
  await expect(horseList(page).getByText('E2E Test')).toBeVisible()
})

test('unknown email shows an error', async ({ page }) => {
  await logIn(page, 'nobody@example.se')
  await expect(page.getByText('Det finns inget konto med den e-postadressen')).toBeVisible()
})

test('new account starts empty after demo use', async ({ page }) => {
  await enterDemo(page)
  await horseList(page).getByRole('button', { name: 'Logga ut' }).click()
  await createAccount(page, 'Tom Användare', 'tom@example.se')
  await expect(horseList(page).getByRole('listitem')).toHaveCount(1)
  await expect(horseList(page).getByRole('button', { name: 'Lägg till häst' })).toBeVisible()
})

test('unmocked api request fails the test', async ({ page }) => {
  // Guard for the mock harness: an /api call without a mock must never pass silently.
  test.fail()
  await page.goto('/')
  const ok = await page.evaluate(() =>
    fetch('/api/okand', { method: 'POST' }).then(
      (r) => r.ok,
      () => false,
    ),
  )
  expect(ok).toBe(true)
})
