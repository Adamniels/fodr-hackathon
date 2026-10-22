import { readFile } from 'node:fs/promises'
import { analysA01, completeReading, forklaring } from './fixtures/ai'
import {
  createAccountWithHorses,
  expect,
  expectGrams,
  expectMoney,
  FIXED_NOW,
  goToStep,
  horseList,
  showExamplePlan,
  test,
  typeKeyByKey,
  uploadExample,
} from './support/helpers'
import { reportWith } from './support/reports'
import type { Locator, Page } from '@playwright/test'

// Analyses on the API (CF4, #26): every test uses a real account with Sixten and Pysen, and an uploaded report is read
// by the e2e API's fake AI from the file itself (support/reports.ts).

/** A real account, Sixten, with the built-in complete example analysis, ending on the plan step. */
async function loadExamplePlan(page: Page): Promise<void> {
  await createAccountWithHorses(page)
  await showExamplePlan(page)
}

const fileInput = (page: Page) => page.getByLabel(/Välj analysrapport/)

const nutrientRow = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) })

test('an uploaded report shows the extracted values, and they survive reload', async ({ page }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await fileInput(page).setInputFiles(reportWith(analysA01))

  await expect(page.getByLabel('Torrsubstans')).toHaveValue(String(analysA01.tsProcent))
  await expect(nutrientRow(page, 'Energi').getByRole('textbox')).toHaveValue(String(analysA01.perKgTs.energi))

  await page.reload()
  await expect(page.getByLabel('Torrsubstans')).toHaveValue(String(analysA01.tsProcent))
  await page.getByRole('button', { name: /Räkna fram foderplan/ }).click()
  await expect(page.getByRole('heading', { name: 'Inköpslista' })).toBeVisible()
  // The plan step after a reload plans from the stored analysis, rather than sending back to the analysis.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Inköpslista' })).toBeVisible()
})

test('non-analysis document is rejected', async ({ page }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await fileInput(page).setInputFiles(reportWith({ ...analysA01, arAnalys: false }))

  await expect(page.getByText('Dokumentet ser inte ut att vara en foderanalys.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Räkna fram foderplan/ })).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Torrsubstans')).toHaveCount(0)
})

test("switching horse shows that horse's own analysis (C4)", async ({ page }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await fileInput(page).setInputFiles(reportWith(analysA01))
  await expect(page.getByLabel('Torrsubstans')).toHaveValue('39.7')

  await horseList(page).getByRole('button', { name: 'Pysen' }).click()
  await expect(page.getByRole('heading', { name: /Pysen/, level: 2 })).toBeVisible()
  await expect(page.getByLabel('Torrsubstans')).toHaveCount(0)
  await uploadExample(page, 'basic')
  const pysensTs = await page.getByLabel('Torrsubstans').inputValue()
  expect(pysensTs).not.toBe('39.7')

  await horseList(page).getByRole('button', { name: 'Sixten' }).click()
  await expect(page.getByLabel('Torrsubstans')).toHaveValue('39.7')
  await horseList(page).getByRole('button', { name: 'Pysen' }).click()
  await expect(page.getByLabel('Torrsubstans')).toHaveValue(pysensTs)
})

test('a file of the wrong type or too large is refused before it is uploaded', async ({ page }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  const uploads: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/analyses')) uploads.push(r.url())
  })

  await fileInput(page).setInputFiles({ name: 'analys.txt', mimeType: 'text/plain', buffer: Buffer.from('text') })
  await expect(page.getByText('Välj en PDF eller en bild (PNG, JPEG eller WebP).')).toBeVisible()

  const photo = Buffer.alloc(5 * 1024 * 1024 + 1)
  await fileInput(page).setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: photo })
  await expect(page.getByText('Filen är för stor. En PDF får vara högst 20 MB och en bild högst 5 MB.')).toBeVisible()
  // A PDF has a limit of its own, 20 MB: just over it is refused as well.
  const pdf = Buffer.alloc(20 * 1024 * 1024 + 1)
  await fileInput(page).setInputFiles({ name: 'stor.pdf', mimeType: 'application/pdf', buffer: pdf })
  await expect(page.getByText('Filen är för stor. En PDF får vara högst 20 MB och en bild högst 5 MB.')).toBeVisible()
  expect(uploads).toEqual([])
})

test('the AI being unavailable is said, and nothing is stored', async ({ page }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await fileInput(page).setInputFiles(reportWith({ error: 'upstream' }))
  await expect(page.getByText('Analysen kunde inte läsas just nu. Försök igen om en stund.')).toBeVisible()
  await expect(page.getByLabel('Torrsubstans')).toHaveCount(0)
})

test('a corrected value is saved, an invalid one is not (CF4)', async ({ page }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await fileInput(page).setInputFiles(reportWith(analysA01))
  const energi = nutrientRow(page, 'Energi').getByRole('textbox')
  await energi.fill('11')
  await expect(page.getByRole('status').filter({ hasText: 'Sparat' })).toBeVisible()

  // An invalid value is never sent: the page holds it back, rather than leaving it to the server to refuse.
  const saves: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().endsWith('/values')) saves.push(r.postData() ?? '')
  })
  await page.getByLabel('Torrsubstans').fill('150')
  await expect(page.getByText('Ändringen sparas när alla värden är giltiga.')).toBeVisible()
  // Longer than the autosave pause, so a save that was going to be sent has been.
  await page.waitForTimeout(1000)
  expect(saves.filter((body) => body.includes('"tsProcent":150'))).toEqual([])

  await page.reload()
  await expect(nutrientRow(page, 'Energi').getByRole('textbox')).toHaveValue('11')
  await expect(page.getByLabel('Torrsubstans')).toHaveValue('39.7')
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

test('saving the plan stores what the server computed, and marks the plan as saved (#27)', async ({ page }) => {
  await loadExamplePlan(page)
  await expect(page.getByText(/^Sparad /)).toHaveCount(0)
  await page.getByRole('button', { name: 'Spara planen i journalen' }).click()

  // The journal entry holds the server's plan, with the analysis it was planned from.
  const entry = page.getByRole('listitem').filter({ hasText: 'Foderplan sparad' })
  await expect(entry).toContainText('Testlabb Alfa')
  await expectGrams(entry, 66)

  await goToStep(page, 'Foderplan')
  await expect(page.getByText(/^Sparad /)).toBeVisible()
  const shoppingRow = (product: string) => page.getByRole('row').filter({ hasText: product })
  await expectGrams(shoppingRow('Krafft Miner Original Pellets 20kg'), 66)
  await expectGrams(shoppingRow('Salt 1,5 kg'), 14)
  await expectMoney(shoppingRow('Totalt utöver grovfodret'), 88)

  await page.reload()
  await expect(page.getByText(/^Sparad /)).toBeVisible()
  // A changed profile is another plan: no longer the saved one.
  await goToStep(page, 'Hästen')
  await page.getByLabel('Vikt (kg)').fill('540')
  await goToStep(page, 'Foderplan')
  await expect(page.getByRole('heading', { name: 'Inköpslista' })).toBeVisible()
  await expect(page.getByText(/^Sparad /)).toHaveCount(0)
})

test('an edit made just before saving is in the saved plan (#27)', async ({ page }) => {
  await loadExamplePlan(page)
  // /api/v1 belongs to the real backend and is otherwise never intercepted: the profile's save is only held back, so
  // the plan is certain to be saved while the edit is still on its way.
  await page.route('**/api/v1/horses/*', async (route) => {
    if (route.request().method() === 'PUT') await new Promise((resolve) => setTimeout(resolve, 5000))
    await route.fallback()
  })
  await goToStep(page, 'Hästen')
  await page.getByLabel('Vikt (kg)').fill('540')
  // Straight to the plan and save, before the edit's autosave would have gone out on its own.
  await goToStep(page, 'Foderplan')
  await page.getByRole('button', { name: 'Spara planen i journalen' }).click()
  // The save waits for the held profile save first.
  await expect(page.getByRole('listitem').filter({ hasText: 'Foderplan sparad' })).toBeVisible({ timeout: 15_000 })
  // The plan on screen (540 kg) is the saved one, so the edit reached the server before the plan was computed.
  await goToStep(page, 'Foderplan')
  await expect(page.getByText(/^Sparad /)).toBeVisible()
})

test('a plan is not saved while an edit has failed to save (#27)', async ({ page }) => {
  await loadExamplePlan(page)
  // As above: a stubbed answer, the only way to make the profile's save fail.
  await page.route('**/api/v1/horses/*', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, contentType: 'application/problem+json', body: '{}' })
      : route.fallback(),
  )
  await goToStep(page, 'Hästen')
  await page.getByLabel('Vikt (kg)').fill('540')
  await expect(page.getByText('Kunde inte spara ändringarna.')).toBeVisible()
  await goToStep(page, 'Foderplan')
  await page.getByRole('button', { name: 'Spara planen i journalen' }).click()
  await expect(page.getByText(/^Alla ändringar är inte sparade än/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Inköpslista' })).toBeVisible()
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

test('a failed rewrite shows the error, and a revisit shows the saved text without asking again', async ({
  page,
  ai,
}) => {
  await loadExamplePlan(page)
  const [first] = forklaring.text.split('\n')
  const paragraphs = page.getByRole('paragraph')
  await expect(paragraphs.filter({ hasText: first })).toBeVisible()

  ai.respondWith('forklaring', { fel: 'Nere' }, 502)
  await page.getByRole('button', { name: 'Skriv om' }).click()
  await expect(page.getByText('Förklaringen kunde inte hämtas')).toBeVisible()
  await ai.settled()
  const callsAfterRewrite = ai.calls('forklaring').length

  await goToStep(page, 'Journal')
  await goToStep(page, 'Foderplan')
  await expect(paragraphs.filter({ hasText: first })).toBeVisible()
  await ai.settled()
  expect(ai.calls('forklaring')).toHaveLength(callsAfterRewrite)
})

test.describe('dry matter entry (#50)', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  // The example analysis has 39,7 % dry matter, which gives 16 kg haylage per day.
  const expectExampleDose = async (page: Page) => {
    await page.getByRole('button', { name: /Räkna fram foderplan/ }).click()
    await expect(page.getByText('Ge 16 kg hösilage per dag.')).toBeVisible()
  }

  async function openExampleAnalysis(page: Page): Promise<Locator> {
    await createAccountWithHorses(page)
    await goToStep(page, 'Analysen')
    await uploadExample(page)
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

test('a cleared dry matter shows the value it holds again when the same report is loaded (#50, #13)', async ({
  page,
}) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await uploadExample(page)
  const torrsubstans = page.getByLabel('Torrsubstans')
  await torrsubstans.fill('')
  await expect(page.getByText('Fyll i ett värde.')).toBeVisible()
  // As a user does: a click on the upload box takes the focus from the field, which then shows its value again, and
  // opens the file chooser for the same report.
  const chooser = page.waitForEvent('filechooser')
  await page.getByText('Välj analysrapport').click()
  await (await chooser).setFiles(reportWith(completeReading))
  await expect(torrsubstans).toHaveValue('39.7')
  await expect(page.getByText('Fyll i ett värde.')).toBeHidden()
})

test('a cleared dry matter shows the value of a report loaded meanwhile (#50, #13)', async ({ page }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await uploadExample(page)
  const torrsubstans = page.getByLabel('Torrsubstans')
  await torrsubstans.fill('')
  await expect(page.getByText('Fyll i ett värde.')).toBeVisible()
  // A value from outside replaces the draft (DecimalInput): the basic analysis has 46 % dry matter.
  await uploadExample(page, 'basic')
  await expect(torrsubstans).toHaveValue('46')
})

test('analysis values: text is refused, a cleared value is missing (C2)', async ({ page }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await uploadExample(page)
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
  await createAccountWithHorses(page)
  await page.getByRole('button', { name: '+ Lägg till foder' }).click()
  const produkt = page.getByPlaceholder('Sök produkt, t.ex. Krafft').last()
  await produkt.fill('Pellets 15 kg Mineral Röd')
  // The gram field in a feed row has no accessible name yet, so it is reached through its row.
  await produkt.locator('xpath=following-sibling::input[1]').fill('100,4')
  await goToStep(page, 'Analysen')
  await uploadExample(page)
  await page.getByRole('button', { name: /Räkna fram foderplan/ }).click()
  await ai.settled()
  const [underlag] = ai.calls('forklaring') as { byten: { fran: string }[] }[]
  expect(underlag.byten.map((b) => b.fran)).toContain('Pellets 15 kg Mineral Röd 100 g/dag')
})

test.describe('the transition calendar across horses and plans (#109)', () => {
  const steps = (page: Page) => page.getByRole('button', { name: /steg \d+: ändra måtten/ })

  async function pysenPlanWithLastStep(page: Page) {
    await createAccountWithHorses(page)
    // Sixten tolerates changes well: 4 steps. Pysen has EMS, so she is sensitive: 5 steps. Each horse has its own
    // analysis (C4), so Sixten gets the example too.
    await page.getByRole('radio', { name: /Tål byten bra/ }).click()
    await goToStep(page, 'Analysen')
    await uploadExample(page)
    await horseList(page).getByRole('button', { name: 'Pysen' }).click()
    await goToStep(page, 'Analysen')
    await uploadExample(page)
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
    // Pysen gets her own analysis first (C4), so she has a plan to switch to.
    await createAccountWithHorses(page)
    await horseList(page).getByRole('button', { name: 'Pysen' }).click()
    await goToStep(page, 'Analysen')
    await uploadExample(page)
    await horseList(page).getByRole('button', { name: 'Sixten' }).click()
    await showExamplePlan(page)
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

test('infeasible plan is not shown as no supplements (C3)', async ({ page, ai }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await uploadExample(page)
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

/** The analysis step after the AI read the A01 report with these values changed (#102). */
async function readA01With(page: Page, values: object) {
  await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await fileInput(page).setInputFiles(reportWith({ ...analysA01, ...values }))
}

test('a reported ash of 0 is a value, not a missing one (#102)', async ({ page }) => {
  await readA01With(page, { askaGPerKgTs: 0 })
  await expect(page.getByLabel('Aska')).toHaveValue('0')
})

test('a reported dry matter of 0 loads and is shown as out of range (#102)', async ({ page }) => {
  // Out-of-range input is shown next to the field (#13), instead of rejecting the report.
  await readA01With(page, { tsProcent: 0 })
  await expect(page.getByLabel('Torrsubstans')).toHaveValue('0')
  await expect(page.getByLabel('Torrsubstans')).toHaveAccessibleDescription('Ange ett värde mellan 1 och 100.')
  await expect(page.getByText('Hittade ingen torrsubstanshalt')).toHaveCount(0)
})

test('a missing ash stays missing (#102)', async ({ page }) => {
  await readA01With(page, { askaGPerKgTs: null })
  await expect(page.getByLabel('Torrsubstans')).toHaveValue(String(analysA01.tsProcent))
  await expect(page.getByLabel('Aska')).toHaveValue('')
})

test('a missing dry matter still rejects the report (#102)', async ({ page }) => {
  await readA01With(page, { tsProcent: null })
  await expect(page.getByText('Hittade ingen torrsubstanshalt i analysen. Fyll i den manuellt.')).toBeVisible()
})

test('a conversion note shows the report value formatted for the locale (#102)', async ({ page }) => {
  const perKgTs = { ...analysA01.perKgTs, energi: null, energiIdisslare: 10.5, smbRp: null, raprotein: 123.4 }
  await readA01With(page, { perKgTs })
  await expect(nutrientRow(page, 'Energi')).toContainText('Räknat från idisslarvärdet 10,5 MJ med SLU:s formel')
  await expect(nutrientRow(page, 'Smältbart råprotein')).toContainText('Räknat från råprotein 123,4 g med SLU:s formel')
})
