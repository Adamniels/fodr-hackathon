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
  // Guard for the mock harness. The body asserts nothing on purpose: the only thing that can fail this
  // test is the teardown check in helpers.ts, so it stays green only while that guard works.
  test.fail()
  await page.goto('/')
  await page.evaluate(() => fetch('/api/okand', { method: 'POST' }).catch(() => undefined))
})

test('api v1 requests reach the server', async ({ page }) => {
  // Guard for the mock harness: /api/v1 belongs to the real backend (ADR 0007), so the mock lets it through.
  // An aborted request rejects the fetch, so getting any status back proves it was not intercepted.
  await page.goto('/')
  const statuses = await page.evaluate(() =>
    Promise.all(['/api/v1', '/api/v1/okand'].map((path) => fetch(path).then((r) => r.status))),
  )
  expect(statuses.every((status) => status > 0)).toBe(true)
})

test('settled waits for a request that starts after it is called', async ({ page, ai }) => {
  // Guard for the mock harness: settled() must measure its quiet window from when it is called, or a request
  // that arrives just after a quiet period is missed.
  await page.goto('/')
  await page.waitForTimeout(700) // let the harness go quiet first
  await page.evaluate(() => {
    setTimeout(() => void fetch('/api/forklaring', { method: 'POST', body: '{}' }), 100)
  })
  await ai.settled()
  expect(ai.calls('forklaring')).toHaveLength(1)
})

test('accounts do not share horses', async ({ page }) => {
  await createAccount(page, 'Användare A', 'a@example.se')
  await page.getByRole('button', { name: 'Lägg till din första häst' }).click()
  await page.getByLabel('Namn').fill('Alfa')
  await expect(horseList(page).getByRole('button', { name: 'Alfa' })).toBeVisible()
  await horseList(page).getByRole('button', { name: 'Logga ut' }).click()

  await createAccount(page, 'Användare B', 'b@example.se')
  await expect(horseList(page).getByRole('button', { name: 'Alfa' })).toHaveCount(0)
})
