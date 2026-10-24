import { analysA01 } from './fixtures/ai'
import { createAccountWithHorses, expect, goToStep, test, uploadExample } from './support/helpers'
import { expectAccessible } from './support/accessibility'
import { reportWith } from './support/reports'
import type { Page } from '@playwright/test'

// An analysis typed in by hand when no report can be read (#145, CF4): the owner gives the roughage type and the dry
// matter, which make the horse's current analysis, and the analysis table takes the rest. Every test uses a real
// account with Sixten and Pysen.

const form = (page: Page) => page.getByRole('form', { name: 'Fyll i analysen själv' })
const openForm = (page: Page) => page.getByRole('button', { name: 'Fyll i värdena själv' }).click()
const nutrientRow = (page: Page, name: string) =>
  page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) })

async function enterByHand(page: Page, values: { typ: 'Hösilage' | 'Hö'; ts: string; labb?: string; datum?: string }) {
  await openForm(page)
  await form(page).getByRole('radio', { name: values.typ, exact: true }).check()
  await form(page).getByLabel('Torrsubstans (%)').fill(values.ts)
  if (values.labb) await form(page).getByLabel('Labb (valfritt)').fill(values.labb)
  if (values.datum) await form(page).getByLabel('Provdatum (valfritt)').fill(values.datum)
  await form(page).getByRole('button', { name: 'Spara och fyll i värden' }).click()
  await expect(form(page)).toHaveCount(0)
}

test('a type and dry matter make the current analysis, whose missing values stay missing (#145)', async ({ page }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await openForm(page)
  await expectAccessible(page, 'manual analysis form')
  await form(page).getByRole('button', { name: 'Avbryt' }).click()
  await expect(form(page)).toHaveCount(0)

  await enterByHand(page, { typ: 'Hö', ts: '85,5' })
  await expect(page.getByRole('heading', { name: /Grovfoderanalysen för Sixten/ })).toBeFocused()
  await expect(page.getByLabel('Torrsubstans')).toHaveValue('85.5')
  // Nothing typed is missing, never 0: energy has no estimate, calcium is estimated.
  await expect(nutrientRow(page, 'Energi').getByRole('textbox')).toHaveValue('')
  await expect(nutrientRow(page, 'Energi')).toContainText('Saknas')
  await expect(page.getByRole('row', { name: /^Kalcium/ })).toContainText('Saknas, uppskattas')
  await expect(page.getByRole('button', { name: /Räkna fram foderplan/ })).toBeDisabled()

  await nutrientRow(page, 'Energi').getByRole('textbox').fill('9,5')
  await expect(page.getByRole('status').filter({ hasText: 'Sparat' })).toBeVisible()
  await page.getByRole('button', { name: /Räkna fram foderplan/ }).click()
  await expect(page.getByRole('heading', { name: 'Inköpslista' })).toBeVisible()
})

test('a hand-entered analysis is still the current one after a reload, with its lab and date (#145)', async ({
  page,
}) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await enterByHand(page, { typ: 'Hösilage', ts: '55', labb: 'Eget labb', datum: '2026-09-14' })
  await expect(page.getByLabel('Torrsubstans')).toHaveValue('55')

  await page.reload()
  await expect(page.getByLabel('Torrsubstans')).toHaveValue('55')
  await expect(page.getByText('Hösilage', { exact: true })).toBeVisible()
  await expect(page.getByText('Eget labb', { exact: true })).toBeVisible()
  await expect(page.getByText('Prov 2026-09-14', { exact: true })).toBeVisible()
})

test('a dry matter that is empty, out of range or no number is refused, and nothing is saved (#145, CF4)', async ({
  page,
}) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  const creates: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/analyses')) creates.push(r.postData() ?? '')
  })
  await openForm(page)
  const ts = form(page).getByLabel('Torrsubstans (%)')
  const save = form(page).getByRole('button', { name: 'Spara och fyll i värden' })

  await save.click()
  await expect(form(page).getByText('Fyll i ett värde.')).toBeVisible()
  await expect(ts).toHaveAttribute('aria-invalid', 'true')
  await expect(ts).toBeFocused()
  await expectAccessible(page, 'manual analysis without dry matter')
  for (const value of ['0', '101']) {
    await ts.fill(value)
    await save.click()
    await expect(form(page).getByText('Ange ett värde mellan 1 och 100.')).toBeVisible()
  }
  // Text that is no number is said as it is typed; Enter in the field does not save the last number it held.
  await ts.fill('55')
  await ts.fill('55x')
  await expect(form(page).getByText('Skriv ett tal, till exempel 12,5.')).toBeVisible()
  await ts.press('Enter')
  await expect(ts).toBeFocused()
  await expect(form(page)).toBeVisible()
  expect(creates).toEqual([])

  await page.reload()
  await expect(page.getByRole('button', { name: 'Fyll i värdena själv' })).toBeVisible()
  await expect(page.getByLabel('Torrsubstans')).toHaveCount(0)
})

test('a report that cannot be read offers entering the values by hand (#145)', async ({ page }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  const fileInput = page.getByLabel(/Välj analysrapport/)

  await fileInput.setInputFiles(reportWith({ ...analysA01, arAnalys: false }))
  const notAnAnalysis = page.getByRole('alert').filter({ hasText: 'Dokumentet ser inte ut att vara en foderanalys.' })
  await expect(notAnAnalysis.getByRole('button', { name: 'Fyll i värdena själv' })).toBeVisible()

  await fileInput.setInputFiles(reportWith({ error: 'upstream' }))
  const unavailable = page.getByRole('alert').filter({ hasText: 'Analysen kunde inte läsas just nu.' })
  await expectAccessible(page, 'failed upload offering manual entry')
  await unavailable.getByRole('button', { name: 'Fyll i värdena själv' }).click()
  // The link goes away with the message, so focus starts on the form's first field: the horse's own roughage.
  await expect(form(page).getByRole('radio', { name: 'Hösilage', checked: true })).toBeFocused()
})

test('entering by hand replaces the current analysis, as an upload does (#145)', async ({ page }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await uploadExample(page)

  await enterByHand(page, { typ: 'Hö', ts: '88' })
  await expect(page.getByLabel('Torrsubstans')).toHaveValue('88')
  await expect(nutrientRow(page, 'Energi').getByRole('textbox')).toHaveValue('')
  await page.reload()
  await expect(page.getByLabel('Torrsubstans')).toHaveValue('88')
})
