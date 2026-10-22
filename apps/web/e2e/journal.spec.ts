import type { Browser, Page } from '@playwright/test'
import {
  clientIpHeaders,
  createAccountWithHorses,
  enterDemo,
  expect,
  goToStep,
  horseList,
  logIn,
  showExamplePlan,
  test,
} from './support/helpers'

/** The account's journal in a browser context of its own, with nothing of the first one's: what the server holds. */
async function journalElsewhere(browser: Browser, email: string): Promise<Page> {
  const other = await browser.newContext({ extraHTTPHeaders: clientIpHeaders() })
  const page = await other.newPage()
  await logIn(page, email)
  await goToStep(page, 'Journal')
  return page
}

// The journal on the API (CF7, #28): the flows run on real accounts. The trend, the AI analysis and the time zone test
// read the demo's journal, which has entries to show, until #29 seeds an account instead.

test('demo journal shows trend', async ({ page }) => {
  await enterDemo(page)
  await goToStep(page, 'Journal')
  await expect(page.getByText('570 → 550 kg')).toBeVisible()
  await expect(page.getByText('8 → 7', { exact: true })).toBeVisible()
})

test('journal entry defaults to the fixed date', async ({ page }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Journal')
  await expect(page.getByLabel('Datum')).toHaveValue('2026-10-15')
})

test('just after midnight the journal entry defaults to the local date (C6)', async ({ page }) => {
  // 00:30 in Stockholm is 22:30 UTC the day before.
  await page.clock.setSystemTime(new Date('2026-10-15T00:30:00+02:00'))
  await createAccountWithHorses(page)
  await goToStep(page, 'Journal')
  await expect(page.getByLabel('Datum')).toHaveValue('2026-10-15')
})

test('a journal entry needs a date and a weight within the limits (#107)', async ({ page }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Journal')
  const add = page.getByRole('button', { name: 'Lägg till', exact: true })
  await page.getByLabel('Vad har du sett?').fill('Pigg')
  await expect(add).toBeEnabled()

  await page.getByLabel('Datum').fill('')
  await expect(page.getByText('Ange ett datum.')).toBeVisible()
  await expect(add).toBeDisabled()

  await page.getByLabel('Datum').fill('2026-10-15')
  await page.getByLabel('Vikt (kg)').fill('0')
  await expect(page.getByText('Ange ett värde mellan 50 och 1 200.')).toBeVisible()
  await expect(add).toBeDisabled()

  // A weight that is not a number says so, instead of being dropped silently.
  await page.getByLabel('Vikt (kg)').fill('abc')
  await expect(page.getByText('Skriv ett tal, till exempel 12,5.')).toBeVisible()
  await page.getByLabel('Vikt (kg)').fill('545,5')
  await expect(page.getByText('Skriv ett tal, till exempel 12,5.')).toBeHidden()
  await expect(add).toBeEnabled()
})

test('the entry date follows today past midnight unless one was picked (#107)', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-15T23:50:00+02:00'))
  await createAccountWithHorses(page)
  await goToStep(page, 'Journal')
  const datum = page.getByLabel('Datum')
  await expect(datum).toHaveValue('2026-10-15')

  // Headless Chromium cannot hide a tab, so the event the browser sends when the page is shown again is dispatched here.
  const shownAgain = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.clock.setSystemTime(new Date('2026-10-16T00:10:00+02:00'))
  await shownAgain()
  await expect(datum).toHaveValue('2026-10-16')

  await datum.fill('2026-10-10')
  await page.clock.setSystemTime(new Date('2026-10-17T00:10:00+02:00'))
  await shownAgain()
  await expect(datum).toHaveValue('2026-10-10')
})

test("switching horse leaves the other horse's draft and AI analysis behind (#109)", async ({ page }) => {
  await enterDemo(page)
  await goToStep(page, 'Journal')
  await page.getByLabel('Datum').fill('2026-10-01')
  await page.getByLabel('Vikt (kg)').fill('540')
  await page.getByLabel('Vad har du sett?').fill('Sixtens anteckning')
  await page.getByLabel('Uppdatera profilen och räkna om foderplanen').uncheck()
  await page.getByRole('button', { name: 'Analysera journalen' }).click()
  await expect(page.getByText('Kontakta veterinär.')).toBeVisible()

  await horseList(page).getByRole('button', { name: 'Pysen' }).click()
  await expect(page.getByLabel('Vikt (kg)')).toHaveValue('')
  await expect(page.getByLabel('Vad har du sett?')).toHaveValue('')
  await expect(page.getByLabel('Datum')).toHaveValue('2026-10-15')
  await expect(page.getByText('Kontakta veterinär.')).toBeHidden()
  // The profile box shows again with a measurement, ticked as for any new draft.
  await page.getByLabel('Vikt (kg)').fill('280')
  await expect(page.getByLabel('Uppdatera profilen och räkna om foderplanen')).toBeChecked()
})

test('entries on the same date are listed in the order they were added, also elsewhere (#80, #28)', async ({
  page,
  browser,
}) => {
  const account = await createAccountWithHorses(page)
  await goToStep(page, 'Journal')
  const texts = ['Första anteckningen', 'Andra anteckningen', 'Tredje anteckningen']
  for (const text of texts) {
    await page.getByLabel('Vad har du sett?').fill(text)
    await page.getByRole('button', { name: 'Lägg till', exact: true }).click()
    await expect(page.getByRole('listitem').filter({ hasText: text })).toBeVisible()
  }
  // The timeline shows the newest first.
  const items = page.getByRole('listitem').filter({ hasText: /anteckningen/ })
  const newestFirst = [...texts].reverse()
  for (const [i, text] of newestFirst.entries()) await expect(items.nth(i)).toContainText(text)

  const elsewhere = await journalElsewhere(browser, account.email)
  const there = elsewhere.getByRole('listitem').filter({ hasText: /anteckningen/ })
  await expect(there).toHaveCount(3)
  for (const [i, text] of newestFirst.entries()) await expect(there.nth(i)).toContainText(text)
  await elsewhere.context().close()
})

test('entry with weight updates the profile, on the server', async ({ page, browser }) => {
  const account = await createAccountWithHorses(page)
  await goToStep(page, 'Journal')
  await page.getByLabel('Vikt (kg)').fill('545')
  await page.getByLabel('Vad har du sett?').fill('Pigg')
  await expect(page.getByLabel('Uppdatera profilen och räkna om foderplanen')).toBeChecked()
  await page.getByRole('button', { name: 'Lägg till', exact: true }).click()

  const newEntry = page.getByRole('listitem').filter({ hasText: 'Pigg' }).filter({ hasText: '2026-10-15' })
  await expect(newEntry).toContainText('545 kg')
  await expect(page.getByRole('definition').filter({ hasText: '545 kg' })).toBeVisible()

  const elsewhere = await journalElsewhere(browser, account.email)
  await expect(elsewhere.getByRole('listitem').filter({ hasText: 'Pigg' })).toContainText('545 kg')
  await expect(elsewhere.getByRole('definition').filter({ hasText: '545 kg' })).toBeVisible()
  await elsewhere.context().close()
})

test('a profile update from an entry recalculates the plan (CF7)', async ({ page }) => {
  await createAccountWithHorses(page)
  await showExamplePlan(page)
  const miner = page.getByRole('row').filter({ hasText: 'Krafft Miner Original Pellets 20kg' })
  const before = await miner.innerText()
  await goToStep(page, 'Journal')
  await page.getByLabel('Vikt (kg)').fill('420')
  await page.getByRole('button', { name: 'Lägg till', exact: true }).click()
  await expect(page.getByRole('definition').filter({ hasText: '420 kg' })).toBeVisible()
  await goToStep(page, 'Foderplan')
  await expect(miner).not.toHaveText(before)
  await page.reload()
  await expect(miner).not.toHaveText(before)
})

test('an entry does not update the profile while a profile edit has failed to save', async ({ page }) => {
  await createAccountWithHorses(page)
  // /api/v1 belongs to the real backend and is otherwise never intercepted; only a stubbed answer fails a save.
  await page.route('**/api/v1/horses/*', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, contentType: 'application/problem+json', body: '{}' })
      : route.fallback(),
  )
  await page.getByLabel('Namn').fill('Sixten Andra')
  await expect(page.getByText('Kunde inte spara ändringarna.')).toBeVisible()
  await goToStep(page, 'Journal')
  await page.getByLabel('Vikt (kg)').fill('545')
  await page.getByRole('button', { name: 'Lägg till', exact: true }).click()
  await expect(page.getByText(/^Hästens ändringar är inte sparade än/)).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '545 kg' })).toHaveCount(0)
})

test('saving the plan adds a timeline entry, kept on the server', async ({ page, browser }) => {
  const account = await createAccountWithHorses(page)
  await showExamplePlan(page)
  await page.getByRole('button', { name: 'Spara planen i journalen' }).click()
  await expect(page.getByRole('heading', { name: 'Journal för Sixten' })).toBeVisible()
  const entry = page.getByRole('listitem').filter({ hasText: 'Foderplan sparad' })
  await expect(entry).toContainText('Testlabb Alfa')
  const elsewhere = await journalElsewhere(browser, account.email)
  await expect(elsewhere.getByRole('listitem').filter({ hasText: 'Foderplan sparad' })).toContainText('Testlabb Alfa')
  await elsewhere.context().close()
})

test('AI journal analysis shows the vet flag', async ({ page, ai }) => {
  await enterDemo(page)
  await goToStep(page, 'Journal')
  await page.getByRole('button', { name: 'Analysera journalen' }).click()

  await expect(page.getByText('Kontakta veterinär.')).toBeVisible()
  const [call] = ai.calls('journal') as { poster: { datum: string }[] }[]
  const dates = call.poster.map((p) => p.datum)
  expect(dates).toEqual([...dates].sort())
  expect(dates).toHaveLength(3)
})

test.describe('in a time zone behind UTC', () => {
  test.use({ timezoneId: 'America/New_York' })

  test('journal dates show the stored calendar day', async ({ page }) => {
    await enterDemo(page)
    await goToStep(page, 'Journal')
    const entry = page.getByRole('listitem').filter({ hasText: 'Startar bantning' })
    await expect(entry).toContainText('2026-08-31')

    await page.getByRole('button', { name: 'Analysera journalen' }).click()
    const pattern = page.getByRole('listitem').filter({ hasText: 'Lös mage efter bytet' })
    await expect(pattern).toContainText('2026-09-28')
  })
})
