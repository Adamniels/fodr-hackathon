import { FOLJDFRAGA, profilMedFoljdfraga } from './fixtures/ai'
import {
  clientIpHeaders,
  createAccount,
  createAccountWithHorses,
  expect,
  goToStep,
  horseList,
  logIn,
  showExamplePlan,
  test,
  typeKeyByKey,
} from './support/helpers'
import { problem } from './support/mock-ai'

// Horse profiles on the API (CF2, #25): every test uses a real account, and the profile is saved on the server.

test('add a horse and it survives reload and another browser context', async ({ page, browser }) => {
  const account = await createAccount(page, 'Hästägare', 'agare@example.se')
  await page.getByRole('button', { name: 'Lägg till din första häst' }).click()
  await page.getByLabel('Namn').fill('Blixten')
  await page.getByLabel('Vikt (kg)').fill('480')
  await page.getByLabel('Ålder (år)').fill('9')
  await expect(page.getByRole('status').filter({ hasText: 'Sparat' })).toBeVisible()

  await page.reload()

  await expect(horseList(page).getByRole('button', { name: 'Blixten' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blixten')
  await expect(page.getByText('480 kg', { exact: true })).toBeVisible()

  // Another device: a browser context of its own, with nothing of this one's, logs in to the same account.
  const other = await browser.newContext({ extraHTTPHeaders: clientIpHeaders() })
  const otherPage = await other.newPage()
  await logIn(otherPage, account.email)
  await expect(horseList(otherPage).getByRole('button', { name: 'Blixten' })).toBeVisible()
  await expect(otherPage.getByText('480 kg', { exact: true })).toBeVisible()
  await expect(otherPage.getByLabel('Ålder (år)')).toHaveValue('9')
  await other.close()
})

test('a change from another device shows when the window is back in focus', async ({ page }) => {
  await createAccountWithHorses(page)
  await expect(page.getByText('550 kg', { exact: true })).toBeVisible()
  // Another device saves a new weight (the same session, through the API).
  const { horses } = (await (await page.request.get('/api/v1/horses')).json()) as {
    horses: ({ id: string } & Record<string, unknown>)[]
  }
  const { id, ...sixten } = horses[0]
  expect((await page.request.put(`/api/v1/horses/${id}`, { data: { ...sixten, viktKg: 560 } })).ok()).toBe(true)
  // The window comes back into view, which is how TanStack Query notices focus.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })))
  await expect(page.getByText('560 kg', { exact: true })).toBeVisible()
})

test('deleting a horse asks first, and cancelling keeps it', async ({ page }) => {
  await createAccountWithHorses(page)
  await page.getByRole('button', { name: 'Ta bort häst' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ta bort Sixten?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Avbryt' }).click()
  await expect(dialog).toBeHidden()
  await expect(horseList(page).getByRole('button', { name: 'Sixten' })).toBeVisible()

  await page.getByRole('button', { name: 'Ta bort häst' }).click()
  await dialog.getByRole('button', { name: 'Ta bort', exact: true }).click()
  await expect(horseList(page).getByRole('button', { name: 'Sixten' })).toBeHidden()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pysen')

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pysen')
  await expect(horseList(page).getByRole('button', { name: 'Sixten' })).toBeHidden()
})

test('a failed save keeps the edit and saves it on retry', async ({ page }) => {
  await createAccountWithHorses(page)
  // /api/v1 belongs to the real backend and is otherwise never intercepted; only a stubbed answer can make a save fail.
  await page.route('**/api/v1/horses/*', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, contentType: 'application/problem+json', body: '{}' })
      : route.fallback(),
  )
  await page.getByLabel('Namn').fill('Sixten Andra')
  await expect(page.getByText('Kunde inte spara ändringarna.')).toBeVisible()
  await expect(page.getByLabel('Namn')).toHaveValue('Sixten Andra')

  await page.unroute('**/api/v1/horses/*')
  await page.getByRole('button', { name: 'Försök igen' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Sparat' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sixten Andra')
})

test('an edit the server refuses says so and offers no retry', async ({ page }) => {
  await createAccountWithHorses(page)
  // As above: a stubbed answer, since the form itself never sends a value the server refuses.
  await page.route('**/api/v1/horses/*', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 400, contentType: 'application/problem+json', body: '{}' })
      : route.fallback(),
  )
  await page.getByLabel('Namn').fill('Sixten Andra')
  await expect(page.getByText(/kunde inte sparas eftersom något värde inte godtas/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Försök igen' })).toBeHidden()
})

test('an edit made just before logging out is saved', async ({ page }) => {
  const account = await createAccountWithHorses(page)
  await page.getByLabel('Namn').fill('Sixten Andra')
  await horseList(page).getByRole('button', { name: 'Logga ut' }).click()
  await logIn(page, account.email)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sixten Andra')
})

test("another account's horse cannot be opened", async ({ page }) => {
  await createAccountWithHorses(page)
  const sixtenUrl = page.url()
  // The verification link of a second account signs the browser in to it.
  await createAccount(page, 'Någon annan', 'annan@example.se')
  await page.goto(sixtenUrl)
  await expect(page).toHaveURL(/\/horses$/)
  await expect(page.getByRole('button', { name: 'Lägg till din första häst' })).toBeVisible()
  await expect(horseList(page).getByRole('button', { name: 'Sixten' })).toBeHidden()
})

test('choosing a breed sets the type', async ({ page }) => {
  await createAccountWithHorses(page)
  // The type segment exposes no accessible pressed state yet, so the active class is asserted.
  const lattfodd = page.getByRole('button', { name: /^Lättfödd/ })
  await expect(lattfodd).not.toHaveClass(/aktiv/)
  await page.getByRole('combobox', { name: /^Ras/ }).selectOption({ label: 'Islandshäst' })
  await expect(lattfodd).toHaveClass(/aktiv/)
})

test('AI fill sets fields and sensitivities', async ({ page, ai }) => {
  await createAccountWithHorses(page)
  await horseList(page).getByRole('button', { name: 'Pysen' }).click()
  await expect(page.getByLabel('Har haft fång')).not.toBeChecked()

  await page.getByLabel('Om hästen och vad den äter i dag').fill('Islandshäst på lösdrift, hade fång i våras')
  await page.getByRole('button', { name: 'Fyll i med AI' }).click()

  await expect(page.getByLabel('Har haft fång')).toBeChecked()
  const calls = ai.calls('profile') as { foderText: string; produkter: unknown[] }[]
  expect(calls).toHaveLength(1)
  expect(calls[0].foderText).toContain('hade fång i våras')
  expect(calls[0].produkter.length).toBeGreaterThan(0)
})

test('AI follow-up question round trip', async ({ page, ai }) => {
  ai.respondWith('profile', profilMedFoljdfraga)
  await createAccountWithHorses(page)
  await page.getByLabel('Om hästen och vad den äter i dag').fill('En liter pellets morgon och kväll')
  await page.getByRole('button', { name: 'Fyll i med AI' }).click()

  await page.getByLabel(FOLJDFRAGA).fill('Cirka 600 g')
  await page.getByRole('button', { name: 'Svara' }).click()

  await expect.poll(() => ai.calls('profile').length).toBe(2)
  const second = ai.calls('profile')[1] as { tidigareSvar: { fraga: string; svar: string }[] }
  expect(second.tidigareSvar).toContainEqual({ fraga: FOLJDFRAGA, svar: 'Cirka 600 g' })
})

test('AI error is shown and the form stays usable', async ({ page, ai }) => {
  ai.respondWith('profile', problem(502, 'ai.unavailable'), 502)
  await createAccountWithHorses(page)
  await page.getByLabel('Om hästen och vad den äter i dag').fill('Något om hästen')
  await page.getByRole('button', { name: 'Fyll i med AI' }).click()

  // The API's problem code, in the catalogue's words (#30).
  await expect(page.getByText('AI-tjänsten svarar inte just nu. Försök igen om en stund.')).toBeVisible()
  await page.getByLabel('Namn').fill('Sixten Andra')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sixten Andra')
})

test('a used daily AI quota is said on the profile too (#31)', async ({ page, ai }) => {
  ai.respondWith('profile', problem(429, 'ai.quota_exceeded'), 429)
  await createAccountWithHorses(page)
  await page.getByLabel('Om hästen och vad den äter i dag').fill('Något om hästen')
  await page.getByRole('button', { name: 'Fyll i med AI' }).click()
  await expect(page.getByText('Du har använt dagens AI-frågor. De fylls på vid midnatt.')).toBeVisible()
})

test('typing a decimal number key by key keeps it (#50)', async ({ page }) => {
  await createAccountWithHorses(page)
  const field = page.getByLabel('Kg per dag (som det utfodras)')
  await typeKeyByKey(field, '12.5')
  await expect(field).toHaveValue('12.5')
  await typeKeyByKey(field, '12,5')
  await expect(field).toHaveValue('12,5')
  // Leaving the step remounts the field, so it now shows the stored value rather than its own draft.
  await goToStep(page, 'Analysen')
  await goToStep(page, 'Hästen')
  await expect(page.getByLabel('Kg per dag (som det utfodras)')).toHaveValue('12.5')
})

test("switching horse leaves the other horse's weight estimate and AI text behind (#109)", async ({ page }) => {
  await createAccountWithHorses(page)
  await page.getByLabel('Bröstomfång (cm)').fill('180')
  await page.getByLabel('Längd armbåge–sittben (cm)').fill('160')
  await expect(page.getByText(/^Uppskattad vikt/)).toBeVisible()
  await page.getByLabel('Om hästen och vad den äter i dag').fill('Sixten äter hösilage')

  await horseList(page).getByRole('button', { name: 'Pysen' }).click()
  await expect(page.getByLabel('Bröstomfång (cm)')).toHaveValue('')
  await expect(page.getByText(/^Uppskattad vikt/)).toBeHidden()
  await expect(page.getByLabel('Om hästen och vad den äter i dag')).toHaveValue('')
})

test('clearing weight is rejected (C2)', async ({ page }) => {
  await createAccountWithHorses(page)
  const weight = page.getByLabel('Vikt (kg)')
  await expect(weight).toHaveValue('550')
  await weight.fill('')
  await expect(page.getByText('Fyll i ett värde.')).toBeVisible()
  // Leaving the empty field brings back the weight it still holds; it never becomes 0.
  await weight.blur()
  await expect(weight).toHaveValue('550')
  await expect(page.getByText('Fyll i ett värde.')).toBeHidden()
})

test('a weight outside the range is shown at the field and stops the plan (C1)', async ({ page }) => {
  await createAccountWithHorses(page)
  await showExamplePlan(page)
  await goToStep(page, 'Hästen')
  await page.getByLabel('Vikt (kg)').fill('0')
  await expect(page.getByText('Ange ett värde mellan 50 och 1 200.')).toBeVisible()
  await goToStep(page, 'Foderplan')
  await expect(page.getByRole('heading', { name: 'Foderplanen kan inte räknas fram' })).toBeVisible()
  await expect(page.getByText('Vikt (kg): Ange ett värde mellan 50 och 1 200.')).toBeVisible()
  await page.getByRole('button', { name: 'Till hästen' }).click()
  await expect(page.getByLabel('Vikt (kg)')).toHaveValue('0')
})
