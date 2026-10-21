import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { analysA01, forklaring } from './fixtures/ai'
import {
  FIXED_NOW,
  enterDemo,
  expect,
  expectGrams,
  expectMoney,
  goToStep,
  horseList,
  loadExamplePlan,
  test,
  typeKeyByKey,
} from './support/helpers'
import type { Locator, Page } from '@playwright/test'

const A01_PDF = fileURLToPath(
  new URL('../../../testdata/Testdata-from-other-dev/krubba-testdata-v2/pdf/A01-medel-skord1.pdf', import.meta.url),
)

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
  await ai.settled()
  const callsAfterFirstVisit = ai.calls('forklaring').length
  expect(callsAfterFirstVisit).toBeGreaterThan(0)

  await goToStep(page, 'Journal')
  await goToStep(page, 'Foderplan')
  await expect(paragraphs.filter({ hasText: first })).toBeVisible()
  await ai.settled()
  expect(ai.calls('forklaring')).toHaveLength(callsAfterFirstVisit)
})

test('explanation failure keeps the plan usable', async ({ page, ai }) => {
  ai.respondWith('forklaring', { fel: 'Nere' }, 502)
  await loadExamplePlan(page)
  await expect(page.getByText('Förklaringen kunde inte hämtas')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Salt 1,5 kg' })).toBeVisible()
})

test.describe('dry matter entry (#50)', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  // The example analysis has 39,7 % dry matter, which gives 16 kg haylage per day.
  const expectExampleDose = async (page: Page) => {
    await page.getByRole('button', { name: /Räkna fram foderplan/ }).click()
    await expect(page.getByText('Ge 16 kg hösilage per dag.')).toBeVisible()
  }

  async function openExampleAnalysis(page: Page): Promise<Locator> {
    await enterDemo(page)
    await goToStep(page, 'Analysen')
    await page.getByRole('button', { name: 'Exempel: komplett analys' }).click()
    return page.getByLabel('Torrsubstans')
  }

  async function paste(page: Page, field: Locator, text: string): Promise<void> {
    await field.click()
    await field.press('ControlOrMeta+a')
    await field.press('Backspace')
    await page.evaluate((t) => navigator.clipboard.writeText(t), text)
    await field.press('ControlOrMeta+v')
  }

  for (const typed of ['39.7', '39,7']) {
    test(`typing ${typed} key by key keeps the value and the plan`, async ({ page }) => {
      const field = await openExampleAnalysis(page)
      await typeKeyByKey(field, typed)
      await expect(field).toHaveValue(typed)
      await expectExampleDose(page)
    })

    test(`pasting ${typed} keeps the value and the plan`, async ({ page }) => {
      const field = await openExampleAnalysis(page)
      await paste(page, field, typed)
      await expect(field).toHaveValue(typed)
      await expectExampleDose(page)
    })
  }

  test('clearing the field shows it empty, not 0', async ({ page }) => {
    const field = await openExampleAnalysis(page)
    await typeKeyByKey(field, '')
    await expect(field).toHaveValue('')
  })
})

test('a cleared dry matter shows the value it holds again when an example is loaded (#50, #13)', async ({ page }) => {
  await enterDemo(page)
  await goToStep(page, 'Analysen')
  await page.getByRole('button', { name: 'Exempel: komplett analys' }).click()
  const torrsubstans = page.getByLabel('Torrsubstans')
  await torrsubstans.fill('')
  await expect(page.getByText('Fyll i ett värde.')).toBeVisible()
  await page.getByRole('button', { name: 'Exempel: komplett analys' }).click()
  await expect(torrsubstans).toHaveValue('39.7')
})

test('analysis values: text is refused, a cleared value is missing (C2)', async ({ page }) => {
  await enterDemo(page)
  await goToStep(page, 'Analysen')
  await page.getByRole('button', { name: 'Exempel: komplett analys' }).click()
  const energi = page.getByRole('textbox', { name: 'Energi' })
  const varde = await energi.inputValue()
  await energi.fill('mycket')
  await expect(page.getByText('Skriv ett tal, till exempel 12,5.')).toBeVisible()
  await energi.blur()
  await expect(energi).toHaveValue(varde)
  // A cleared value is not reported as 0: it is missing, and the plan estimates it.
  await page.getByRole('textbox', { name: 'Kalcium (Ca)' }).fill('')
  await page.getByRole('textbox', { name: 'Kalcium (Ca)' }).blur()
  await expect(page.getByRole('textbox', { name: 'Kalcium (Ca)' })).toHaveValue('')
  await expect(page.getByRole('row', { name: /^Kalcium/ })).toContainText('Saknas, uppskattas')
})

test('the plan explanation gets grams as the page shows them (#103)', async ({ page, ai }) => {
  await enterDemo(page)
  await page.getByRole('button', { name: '+ Lägg till foder' }).click()
  const produkt = page.getByPlaceholder('Sök produkt, t.ex. Krafft').last()
  await produkt.fill('Pellets 15 kg Mineral Röd')
  // The gram field in a feed row has no accessible name yet, so it is reached through its row.
  await produkt.locator('xpath=following-sibling::input[1]').fill('100,4')
  await goToStep(page, 'Analysen')
  await page.getByRole('button', { name: 'Exempel: komplett analys' }).click()
  await page.getByRole('button', { name: /Räkna fram foderplan/ }).click()
  await ai.settled()
  const [underlag] = ai.calls('forklaring') as { byten: { fran: string }[] }[]
  expect(underlag.byten.map((b) => b.fran)).toContain('Pellets 15 kg Mineral Röd 100 g/dag')
})

test.describe('the transition calendar across horses and plans (#109)', () => {
  const steps = (page: Page) => page.getByRole('button', { name: /steg \d+: ändra måtten/ })

  async function pysenPlanWithLastStep(page: Page) {
    await enterDemo(page)
    // Sixten tolerates changes well: 4 steps. Pysen has EMS, so she is sensitive: 5 steps.
    await page.getByRole('radio', { name: /Tål byten bra/ }).click()
    await horseList(page).getByRole('button', { name: 'Pysen' }).click()
    await goToStep(page, 'Analysen')
    await page.getByRole('button', { name: 'Exempel: komplett analys' }).click()
    await page.getByRole('button', { name: /Räkna fram foderplan/ }).click()
    await expect(steps(page)).toHaveCount(5)
    await steps(page).last().click()
  }

  test('switching to a horse with fewer steps shows its calendar from the first step', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await pysenPlanWithLastStep(page)
    await horseList(page).getByRole('button', { name: 'Sixten' }).click()
    await expect(steps(page)).toHaveCount(4)
    await expect(page.getByRole('button', { name: /steg 1: ändra måtten/, pressed: true })).toHaveCount(1)
    expect(errors).toEqual([])
  })

  test('coming back to a plan with fewer steps for the same horse selects a step it has', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await pysenPlanWithLastStep(page)
    await goToStep(page, 'Hästen')
    await page.getByRole('radio', { name: /Tål byten bra/ }).click()
    await goToStep(page, 'Foderplan')
    await expect(steps(page)).toHaveCount(4)
    // Leaving for the horse step remounts the plan, so the calendar starts again on a step the plan has.
    await expect(page.getByRole('button', { name: /steg \d+: ändra måtten/, pressed: true })).toHaveCount(1)
    expect(errors).toEqual([])
  })

  test('a start date picked for one horse does not carry over', async ({ page }) => {
    await loadExamplePlan(page)
    await page.getByLabel('Första dagen').fill('2026-11-02')
    await expect(page.getByLabel('Första dagen')).toHaveValue('2026-11-02')
    await horseList(page).getByRole('button', { name: 'Pysen' }).click()
    await expect(page.getByLabel('Första dagen')).toHaveValue('2026-10-16')
  })
})

// #106: the grid was sized in milliseconds, so the 25-hour day in October added an empty week.
test('a period across a clock change shows only its own weeks (#106)', async ({ page }) => {
  await loadExamplePlan(page)
  const kalender = page.getByRole('group', { name: 'Kalender för foderbytet' })
  // Sixten is sensitive: 14 days, Monday 19 October to Sunday 1 November, across the change on 25 October.
  await page.getByLabel('Första dagen').fill('2026-10-19')
  await expect(kalender.getByText('1', { exact: true })).toBeVisible()
  await expect(kalender.getByText('8', { exact: true })).toHaveCount(0)
  // Across the change to summer time (28 March 2027): Monday 22 March to Sunday 4 April.
  await page.getByLabel('Första dagen').fill('2027-03-22')
  await expect(kalender.getByText('4', { exact: true })).toBeVisible()
  await expect(kalender.getByText('11', { exact: true })).toHaveCount(0)
})

test('calendar download is a valid ics', async ({ page }) => {
  await loadExamplePlan(page)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Lägg in i min kalender' }).click()
  const ics = await readFile(await (await download).path(), 'utf8')
  expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
  expect(ics).toContain('SUMMARY:Fodr: Sixten')
  // The calendar starts tomorrow in local time, so the first step falls on the day after FIXED_NOW in Stockholm.
  const tomorrow = new Date(FIXED_NOW.getTime() + 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
  expect(ics).toContain(`DTSTART;VALUE=DATE:${tomorrow.replace(/-/g, '')}`)
  expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
})

test.skip("switching horse uses that horse's analysis (C4, fixed in M1/M2)", () => {})
test('infeasible plan is not shown as no supplements (C3)', async ({ page, ai }) => {
  await enterDemo(page)
  await goToStep(page, 'Analysen')
  await page.getByRole('button', { name: 'Exempel: komplett analys' }).click()
  // The audit's probe: selenium read in µg as mg, far over SLU's maximum before any supplement.
  await page.getByRole('textbox', { name: 'Selen (Se)' }).fill('60')
  await page.getByRole('button', { name: /Räkna fram foderplan/ }).click()
  const reason = 'Grovfodret ger redan mer selen än SLU:s maxgräns'
  await expect(page.getByText(reason)).toBeVisible()
  await expect(page.getByText('Inga tillskott behövs utöver grovfodret.')).toBeHidden()
  // The explanation reads the reason among the warnings, so it cannot say that no supplements are needed.
  await ai.settled()
  const [underlag] = ai.calls('forklaring') as { varningar: string[] }[]
  expect(underlag.varningar.some((v) => v.startsWith(reason))).toBe(true)
})
