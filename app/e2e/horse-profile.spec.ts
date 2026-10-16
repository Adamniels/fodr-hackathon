import { FOLJDFRAGA, profilMedFoljdfraga } from './fixtures/ai'
import { createAccount, enterDemo, expect, horseList, test, typeKeyByKey } from './support/helpers'

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
  await page.getByRole('combobox', { name: /^Ras/ }).selectOption({ label: 'Islandshäst' })
  // The type segment exposes no accessible pressed state yet, so the active class is asserted.
  await expect(page.getByRole('button', { name: /^Lättfödd/ })).toHaveClass(/aktiv/)
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
})

test.skip('clearing weight is rejected (C2, fixed in M1)', () => {})
