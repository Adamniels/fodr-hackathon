import { readFile } from 'node:fs/promises'
import { analysA01, forklaring } from './fixtures/ai'
import { enterDemo, expect, expectGrams, expectMoney, goToStep, loadExamplePlan, test } from './support/helpers'

const A01_PDF = '../testdata/Testdata-from-other-dev/krubba-testdata-v2/pdf/A01-medel-skord1.pdf'

const nutrientRow = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) })

test('upload a report shows extracted values', async ({ page, ai }) => {
  await enterDemo(page)
  await goToStep(page, 'Analysen')
  await page.locator('input[type="file"]').setInputFiles(A01_PDF)

  await expect(page.getByLabel('Torrsubstans')).toHaveValue(String(analysA01.tsProcent))
  await expect(nutrientRow(page, 'Energi').getByRole('textbox')).toHaveValue(String(analysA01.perKgTs.energi))
  const [call] = ai.calls('analys') as { mediaType: string; base64: string }[]
  expect(call.mediaType).toBe('application/pdf')
  expect(call.base64.length).toBeGreaterThan(0)
})

test('non-analysis document is rejected', async ({ page, ai }) => {
  ai.respondWith('analys', { ...analysA01, arAnalys: false })
  await enterDemo(page)
  await goToStep(page, 'Analysen')
  await page.locator('input[type="file"]').setInputFiles(A01_PDF)

  await expect(page.getByText('Dokumentet ser inte ut att vara en foderanalys.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Räkna fram foderplan/ })).toHaveCount(0)
})

test('example analysis produces the known plan', async ({ page }) => {
  await loadExamplePlan(page)
  // Verified 2026-10-15 by running skapaPlan(demoHast, analysKomplett); matches the README demo script.
  // If these change, the engine changed: investigate before updating.
  const shoppingRow = (product: string) => page.getByRole('row').filter({ hasText: product })
  await expectGrams(shoppingRow('Krafft Miner Original Pellets 20kg'), 66)
  await expectGrams(shoppingRow('Salt 1,5 kg'), 14)
  await expectMoney(shoppingRow('Totalt utöver grovfodret'), 88)
  await expectMoney(page.getByLabel('Kostnad per månad'), 286)
  await expect(page.getByRole('listitem').filter({ hasText: 'Ta bort Krafft Leisure Pellets 20kg' })).toBeVisible()
})

test('plan explanation comes from the AI mock', async ({ page, ai }) => {
  await loadExamplePlan(page)
  const paragraphs = page.getByRole('paragraph')
  const [first, second] = forklaring.text.split('\n')
  await expect(paragraphs.filter({ hasText: first })).toBeVisible()
  await expect(paragraphs.filter({ hasText: second })).toBeVisible()
  // Dev mode runs effects twice (React StrictMode), so the first visit may send two requests.
  // The contract tested here is the cache: revisiting the same plan sends no new request.
  const callsAfterFirstVisit = ai.calls('forklaring').length
  expect(callsAfterFirstVisit).toBeGreaterThan(0)

  await goToStep(page, 'Journal')
  await goToStep(page, 'Foderplan')
  await expect(paragraphs.filter({ hasText: first })).toBeVisible()
  expect(ai.calls('forklaring')).toHaveLength(callsAfterFirstVisit)
})

test('explanation failure keeps the plan usable', async ({ page, ai }) => {
  ai.respondWith('forklaring', { fel: 'Nere' }, 502)
  await loadExamplePlan(page)
  await expect(page.getByText('Förklaringen kunde inte hämtas')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Salt 1,5 kg' })).toBeVisible()
})

test('calendar download is a valid ics', async ({ page }) => {
  await loadExamplePlan(page)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Lägg in i min kalender' }).click()
  const ics = await readFile(await (await download).path(), 'utf8')
  expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
  expect(ics).toContain('SUMMARY:Fodr: Sixten')
  expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
})

test.skip("switching horse uses that horse's analysis (C4, fixed in M1/M2)", () => {})
test.skip('infeasible plan is not shown as no supplements (C3, fixed in M1)', () => {})
