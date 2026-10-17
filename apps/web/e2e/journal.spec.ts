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
