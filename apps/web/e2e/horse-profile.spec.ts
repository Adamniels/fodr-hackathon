import { FOLJDFRAGA, profilMedFoljdfraga } from './fixtures/ai'
import {
  createAccount,
  enterDemo,
  expect,
  goToStep,
  horseList,
  loadExamplePlan,
  test,
  typeKeyByKey,
} from './support/helpers'

test('add a horse and it survives reload', async ({ page }) => {
  await createAccount(page, 'Hästägare', 'agare@example.se')
  await page.getByRole('button', { name: 'Lägg till din första häst' }).click()
  await page.getByLabel('Namn').fill('Blixten')
  await page.getByLabel('Vikt (kg)').fill('480')
  await page.getByLabel('Ålder (år)').fill('9')

  await page.reload()

  await expect(horseList(page).getByRole('button', { name: 'Blixten' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blixten')
  await expect(page.getByText('480 kg', { exact: true })).toBeVisible()
})

test('choosing a breed sets the type', async ({ page }) => {
  await enterDemo(page)
  // The type segment exposes no accessible pressed state yet, so the active class is asserted.
  const lattfodd = page.getByRole('button', { name: /^Lättfödd/ })
  await expect(lattfodd).not.toHaveClass(/aktiv/)
  await page.getByRole('combobox', { name: /^Ras/ }).selectOption({ label: 'Islandshäst' })
  await expect(lattfodd).toHaveClass(/aktiv/)
})

test('AI fill sets fields and sensitivities', async ({ page, ai }) => {
  await enterDemo(page)
  await horseList(page).getByRole('button', { name: 'Pysen' }).click()
  await expect(page.getByLabel('Har haft fång')).not.toBeChecked()

  await page.getByLabel('Om hästen och vad den äter i dag').fill('Islandshäst på lösdrift, hade fång i våras')
  await page.getByRole('button', { name: 'Fyll i med AI' }).click()

  await expect(page.getByLabel('Har haft fång')).toBeChecked()
  const calls = ai.calls('profil') as { foderText: string; produkter: unknown[] }[]
  expect(calls).toHaveLength(1)
  expect(calls[0].foderText).toContain('hade fång i våras')
  expect(calls[0].produkter.length).toBeGreaterThan(0)
})

test('AI follow-up question round trip', async ({ page, ai }) => {
  ai.respondWith('profil', profilMedFoljdfraga)
  await enterDemo(page)
  await page.getByLabel('Om hästen och vad den äter i dag').fill('En liter pellets morgon och kväll')
  await page.getByRole('button', { name: 'Fyll i med AI' }).click()

  await page.getByLabel(FOLJDFRAGA).fill('Cirka 600 g')
  await page.getByRole('button', { name: 'Svara' }).click()

  await expect.poll(() => ai.calls('profil').length).toBe(2)
  const second = ai.calls('profil')[1] as { tidigareSvar: { fraga: string; svar: string }[] }
  expect(second.tidigareSvar).toContainEqual({ fraga: FOLJDFRAGA, svar: 'Cirka 600 g' })
})

test('AI error is shown and the form stays usable', async ({ page, ai }) => {
  ai.respondWith('profil', { fel: 'Testfel' }, 500)
  await enterDemo(page)
  await page.getByLabel('Om hästen och vad den äter i dag').fill('Något om hästen')
  await page.getByRole('button', { name: 'Fyll i med AI' }).click()

  await expect(page.getByText('Testfel')).toBeVisible()
  await page.getByLabel('Namn').fill('Sixten Andra')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sixten Andra')
})

test('typing a decimal number key by key keeps it (#50)', async ({ page }) => {
  await enterDemo(page)
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

test('clearing weight is rejected (C2)', async ({ page }) => {
  await enterDemo(page)
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
  await loadExamplePlan(page)
  await goToStep(page, 'Hästen')
  await page.getByLabel('Vikt (kg)').fill('0')
  await expect(page.getByText('Ange ett värde mellan 50 och 1 200.')).toBeVisible()
  await goToStep(page, 'Foderplan')
  await expect(page.getByRole('heading', { name: 'Foderplanen kan inte räknas fram' })).toBeVisible()
  await expect(page.getByText('Vikt (kg): Ange ett värde mellan 50 och 1 200.')).toBeVisible()
  await page.getByRole('button', { name: 'Till hästen' }).click()
  await expect(page.getByLabel('Vikt (kg)')).toHaveValue('0')
})
