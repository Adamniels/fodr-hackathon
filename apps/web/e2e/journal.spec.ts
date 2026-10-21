import { enterDemo, expect, goToStep, loadExamplePlan, test } from './support/helpers'

test('demo journal shows trend', async ({ page }) => {
  await enterDemo(page)
  await goToStep(page, 'Journal')
  await expect(page.getByText('570 → 550 kg')).toBeVisible()
  await expect(page.getByText('8 → 7', { exact: true })).toBeVisible()
})

test('journal entry defaults to the fixed date', async ({ page }) => {
  await enterDemo(page)
  await goToStep(page, 'Journal')
  await expect(page.getByLabel('Datum')).toHaveValue('2026-10-15')
})

test('just after midnight the journal entry defaults to the local date (C6)', async ({ page }) => {
  // 00:30 in Stockholm is 22:30 UTC the day before.
  await page.clock.setSystemTime(new Date('2026-10-15T00:30:00+02:00'))
  await enterDemo(page)
  await goToStep(page, 'Journal')
  await expect(page.getByLabel('Datum')).toHaveValue('2026-10-15')
})

test('a journal entry needs a date and a weight within the limits (#107)', async ({ page }) => {
  await enterDemo(page)
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
})

test('the entry date follows today past midnight unless one was picked (#107)', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-15T23:50:00+02:00'))
  await enterDemo(page)
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

test('entry with weight updates the profile', async ({ page }) => {
  await enterDemo(page)
  await goToStep(page, 'Journal')
  await page.getByLabel('Vikt (kg)').fill('545')
  await page.getByLabel('Vad har du sett?').fill('Pigg')
  await expect(page.getByLabel('Uppdatera profilen och räkna om foderplanen')).toBeChecked()
  await page.getByRole('button', { name: 'Lägg till', exact: true }).click()

  const newEntry = page.getByRole('listitem').filter({ hasText: 'Pigg' }).filter({ hasText: '2026-10-15' })
  await expect(newEntry).toContainText('545 kg')
  await expect(page.getByRole('definition').filter({ hasText: '545 kg' })).toBeVisible()
})

test('saving the plan adds a timeline entry', async ({ page }) => {
  await loadExamplePlan(page)
  await page.getByRole('button', { name: 'Spara planen i journalen' }).click()
  await expect(page.getByRole('heading', { name: 'Journal för Sixten' })).toBeVisible()
  await expect(page.getByText('Foderplan sparad')).toBeVisible()
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
