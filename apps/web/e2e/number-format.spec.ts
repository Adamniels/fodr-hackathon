// Numbers are formatted for the active locale, sv-SE: a decimal comma and a no-break space between thousands
// (ADR 0014). \s matches the no-break space.

import { enterDemo, expect, goToStep, test } from './support/helpers'

test('horse properties show decimals with a comma', async ({ page }) => {
  await enterDemo(page)
  await page.getByLabel('Kg per dag (som det utfodras)').fill('8,5')
  await page.getByLabel('Vikt (kg)').fill('545,5')

  await expect(page.getByRole('definition').filter({ hasText: 'per dag' })).toHaveText('8,5 kg hösilage per dag')
  await expect(page.getByRole('definition').filter({ hasText: /^545,5 kg$/ })).toBeVisible()

  await goToStep(page, 'Journal')
  await expect(page.getByLabel('Vikt (kg)')).toHaveAttribute('placeholder', '545,5')
})

test('the shopping list and the saved plan format kilograms and grams', async ({ page }) => {
  await enterDemo(page)
  // A heavier horse competing at a higher level needs enough energy that its 1000 g of pellets are kept.
  await page.getByLabel('Vikt (kg)').fill('600')
  await page
    .getByRole('combobox', { name: /^Gren och nivå/ })
    .selectOption({ label: 'Tävling högre nivå, fälttävlan, svårare hoppning' })
  await goToStep(page, 'Analysen')
  await page.getByRole('button', { name: 'Exempel: basanalys' }).click()
  await page.getByRole('button', { name: /Räkna fram foderplan/ }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Krafft Leisure Pellets 20kg' })).toContainText(/1\s000\sg/)

  await page.getByRole('button', { name: 'Spara planen i journalen' }).click()
  const saved = page.getByRole('listitem').filter({ hasText: 'Foderplan sparad' })
  await expect(saved).toContainText('20,8 kg grovfoder')
  await expect(saved).toContainText(/1\s000\sg Hästfoder Krafft Leisure Pellets/)
})

test('a journal weight with a decimal shows a comma in the chip and the trend', async ({ page }) => {
  await enterDemo(page)
  await goToStep(page, 'Journal')
  await page.getByLabel('Vikt (kg)').fill('545.5')
  await page.getByLabel('Vad har du sett?').fill('Vägd')
  await page.getByRole('button', { name: 'Lägg till', exact: true }).click()

  await expect(page.getByRole('listitem').filter({ hasText: 'Vägd' })).toContainText('545,5 kg')
  await expect(page.getByText('570 → 545,5 kg')).toBeVisible()
})

test('the landing page shows its figures formatted', async ({ page }) => {
  await page.goto('/')
  const figures = page.getByRole('region', { name: 'Hästar i Sverige' })
  await expect(figures).toContainText(/355\s500/)
  await expect(figures).toContainText(/55\s%/)
  await expect(figures).toContainText(/600–1\s800\skr/)
  for (const value of [/39,7\s%/, /10,2\sMJ/, /104\sg/, /61\sg/, 'saknas']) {
    await expect(page.getByText(value, { exact: true })).toBeVisible()
  }
})
