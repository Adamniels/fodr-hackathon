import type { Browser, Page, Route } from '@playwright/test'
import {
  clientIpHeaders,
  createAccountWithHorses,
  expect,
  goToStep,
  logIn,
  test,
  uploadExample,
  type Account,
} from './support/helpers'
import { expectAccessible } from './support/accessibility'

// Edits of one horse from two devices (#140): a save based on an older copy than the server holds is refused, the user
// is told what differs, and chooses. Each device is a browser context of its own, logged in to the same account.

async function otherDevice(browser: Browser, account: Account): Promise<Page> {
  const context = await browser.newContext({ extraHTTPHeaders: clientIpHeaders() })
  const page = await context.newPage()
  await logIn(page, account.email)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sixten')
  return page
}

// The notice is a region named by its title; only the title and its first sentence are read out as an alert, so the
// list under it is not read again on every keystroke while the choice waits.
const horseNotice = (page: Page) => page.getByRole('region', { name: 'Hästen har ändrats på en annan enhet.' })
const analysisNotice = (page: Page) => page.getByRole('region', { name: 'Analysen har ändrats på en annan enhet.' })

const saved = (page: Page) => expect(page.getByRole('status').filter({ hasText: 'Sparat' })).toBeVisible()

/** What the server holds of the first horse, read on the page's own session. */
async function serverHorse(page: Page): Promise<Record<string, unknown>> {
  const { horses } = (await (await page.request.get('/api/v1/horses')).json()) as { horses: Record<string, unknown>[] }
  return horses[0]
}

/** Device B saves a new weight; device A, still on its older copy, then changes the name. */
async function conflictOnTheName(page: Page, browser: Browser) {
  const account = await createAccountWithHorses(page)
  const other = await otherDevice(browser, account)
  await other.getByLabel('Vikt (kg)').fill('545')
  await saved(other)

  await page.getByLabel('Namn').fill('Sixten II')
  const notice = horseNotice(page)
  await expect(notice).toBeVisible()
  return { other, notice }
}

test('a save based on an older copy of the horse is not saved over the newer one, and says what differs', async ({
  page,
  browser,
}) => {
  const { other, notice } = await conflictOnTheName(page, browser)
  await expect(page.getByRole('status').filter({ hasText: 'Ändrad på en annan enhet' })).toBeVisible()
  await expect(notice.getByRole('listitem').filter({ hasText: 'Vikt (kg)' })).toHaveText(
    'Vikt (kg): sparat 545, ditt 550',
  )
  await expect(notice.getByRole('listitem').filter({ hasText: 'Namn' })).toHaveText(
    'Namn: sparat Sixten, ditt Sixten II',
  )
  await expectAccessible(page, 'the horse changed on another device')

  // Nothing of device A's copy reached the server: device B's weight stands.
  expect(await serverHorse(page)).toMatchObject({ namn: 'Sixten', viktKg: 545 })
  await other.context().close()
})

test('taking the newer copy shows it in the form and saves nothing over it', async ({ page, browser }) => {
  const { other, notice } = await conflictOnTheName(page, browser)
  await expect(page.getByRole('alert').filter({ hasText: 'Hästen har ändrats på en annan enhet' })).toBeVisible()
  await notice.getByRole('button', { name: 'Använd de nya' }).click()
  await expect(notice).toBeHidden()
  // Focus goes to the horse's heading, not lost with the button.
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await expect(page.getByLabel('Vikt (kg)')).toHaveValue('545')
  await expect(page.getByLabel('Namn')).toHaveValue('Sixten')

  // An edit from the newer copy saves as any other.
  await page.getByLabel('Ålder (år)').fill('13')
  await saved(page)
  expect(await serverHorse(page)).toMatchObject({ namn: 'Sixten', viktKg: 545, alderAr: 13 })
  await other.context().close()
})

test('keeping my copy saves it, with the edits made while the choice waited', async ({ page, browser }) => {
  const { other, notice } = await conflictOnTheName(page, browser)
  // Typing on while the notice is up is kept for the choice, not sent.
  await page.getByLabel('Namn').fill('Sixten III')
  await expect(notice.getByRole('listitem').filter({ hasText: 'Namn' })).toHaveText(
    'Namn: sparat Sixten, ditt Sixten III',
  )
  expect(await serverHorse(page)).toMatchObject({ namn: 'Sixten', viktKg: 545 })

  await notice.getByRole('button', { name: 'Behåll mina' }).click()
  await saved(page)
  await expect(notice).toBeHidden()
  expect(await serverHorse(page)).toMatchObject({ namn: 'Sixten III', viktKg: 550 })

  await page.getByLabel('Ålder (år)').fill('13')
  await saved(page)
  await other.reload()
  await expect(other.getByLabel('Namn')).toHaveValue('Sixten III')
  await expect(other.getByLabel('Ålder (år)')).toHaveValue('13')
  await other.context().close()
})

test('a correction based on an older copy of the analysis is not saved over the newer one', async ({
  page,
  browser,
}) => {
  const account = await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await uploadExample(page)
  const other = await otherDevice(browser, account)
  await goToStep(other, 'Analysen')
  await other.getByLabel('Torrsubstans').fill('61')
  await saved(other)

  await page.getByLabel('Torrsubstans').fill('59')
  const notice = analysisNotice(page)
  await expect(notice).toBeVisible()
  await expect(notice.getByRole('listitem').filter({ hasText: 'Torrsubstans' })).toHaveText(
    'Torrsubstans: sparat 61, ditt 59',
  )
  await expectAccessible(page, 'the analysis changed on another device')

  await notice.getByRole('button', { name: 'Använd de nya' }).click()
  await expect(notice).toBeHidden()
  await expect(page.getByLabel('Torrsubstans')).toHaveValue('61')
  await page.reload()
  await expect(page.getByLabel('Torrsubstans')).toHaveValue('61')
  await other.context().close()
})

test("a journal entry's profile update is no conflict for the device that made it", async ({ page }) => {
  await createAccountWithHorses(page)
  await goToStep(page, 'Journal')
  await page.getByLabel('Vikt (kg)').fill('545')
  await page.getByLabel('Vad har du sett?').fill('Pigg')
  await page.getByRole('button', { name: 'Lägg till', exact: true }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Pigg' })).toContainText('545 kg')

  await goToStep(page, 'Hästen')
  await page.getByLabel('Namn').fill('Sixten II')
  await saved(page)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await serverHorse(page)).toMatchObject({ namn: 'Sixten II', viktKg: 545 })
})

test('the same edit made on both devices is no conflict (#140 review)', async ({ page, browser }) => {
  const account = await createAccountWithHorses(page)
  const other = await otherDevice(browser, account)
  await other.getByLabel('Vikt (kg)').fill('545')
  await saved(other)

  await page.getByLabel('Vikt (kg)').fill('545')
  await saved(page)
  await expect(horseNotice(page)).toHaveCount(0)
  await page.getByLabel('Ålder (år)').fill('13')
  await saved(page)
  await expect(horseNotice(page)).toHaveCount(0)
  expect(await serverHorse(page)).toMatchObject({ viktKg: 545, alderAr: 13 })
  await other.context().close()
})

test('keeping my corrections saves them, and waits while a value is invalid (#140 review)', async ({
  page,
  browser,
}) => {
  const account = await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await uploadExample(page)
  const other = await otherDevice(browser, account)
  await goToStep(other, 'Analysen')
  await other.getByLabel('Torrsubstans').fill('61')
  await saved(other)

  await page.getByLabel('Torrsubstans').fill('59')
  const notice = analysisNotice(page)
  await expect(notice).toBeVisible()
  // An invalid value cannot be kept; the choice waits for a valid one, which it then holds.
  await page.getByLabel('Torrsubstans').fill('0')
  await expect(notice.getByRole('button', { name: 'Behåll mina' })).toHaveCount(0)
  await page.getByLabel('Torrsubstans').fill('58')
  await expect(notice.getByRole('listitem').filter({ hasText: 'Torrsubstans' })).toHaveText(
    'Torrsubstans: sparat 61, ditt 58',
  )
  await notice.getByRole('button', { name: 'Behåll mina' }).click()
  await saved(page)
  await expect(notice).toBeHidden()
  await expect(page.getByRole('heading', { level: 2, name: /^Grovfoderanalysen/ })).toBeFocused()
  await other.reload()
  await expect(other.getByLabel('Torrsubstans')).toHaveValue('58')
  await other.context().close()
})

test('a correction waiting behind one on its way still reaches the server when logging out (#140 review)', async ({
  page,
}) => {
  const account = await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await uploadExample(page)
  // The first correction is held on its way, so the second waits behind it while the workspace closes.
  let held: Route | undefined
  let heldSeen: () => void = () => undefined
  const seen = new Promise<void>((resolve) => (heldSeen = resolve))
  await page.route('**/api/v1/horses/*/analyses/*/values', async (route) => {
    if (held) return route.continue()
    held = route
    heldSeen()
  })
  await page.getByLabel('Torrsubstans').fill('50')
  await seen
  await page.getByLabel('Torrsubstans').fill('51')
  await page.getByRole('button', { name: 'Logga ut' }).click()
  await held?.continue()
  await expect(page.getByRole('button', { name: /^Fortsätt som/ })).toHaveCount(0)

  await page.unrouteAll()
  await logIn(page, account.email)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sixten')
  await goToStep(page, 'Analysen')
  await expect(page.getByLabel('Torrsubstans')).toHaveValue('51')
})

test("a journal entry's update that arrives while an edit is on its way is listed, never saved over unseen (#140 review)", async ({
  page,
}) => {
  await createAccountWithHorses(page)
  // The entry's request and then the profile save are held, so the entry's update reaches the page while the edit,
  // made from the copy before it, is on its way.
  let journal: Route | undefined
  let save: Route | undefined
  let journalHeld: () => void = () => undefined
  let saveHeld: () => void = () => undefined
  const journalSeen = new Promise<void>((resolve) => (journalHeld = resolve))
  const saveSeen = new Promise<void>((resolve) => (saveHeld = resolve))
  await page.route('**/api/v1/horses/*/journal', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    journal = route
    journalHeld()
  })
  await page.route('**/api/v1/horses/*', async (route) => {
    if (route.request().method() !== 'PUT' || save) return route.continue()
    save = route
    saveHeld()
  })

  await goToStep(page, 'Journal')
  await page.getByLabel('Vikt (kg)').fill('545')
  await page.getByLabel('Vad har du sett?').fill('Pigg')
  await page.getByRole('button', { name: 'Lägg till', exact: true }).click()
  await journalSeen
  await goToStep(page, 'Hästen')
  await page.getByLabel('Namn').fill('Sixten II')
  await saveSeen
  const entry = page.waitForResponse((r) => r.url().endsWith('/journal') && r.request().method() === 'POST')
  await journal?.continue()
  await entry
  await save?.continue()

  const notice = horseNotice(page)
  await expect(notice).toBeVisible()
  await expect(notice.getByRole('listitem').filter({ hasText: 'Vikt (kg)' })).toHaveText(
    'Vikt (kg): sparat 545, ditt 550',
  )
  await expect(page.getByLabel('Namn')).toHaveValue('Sixten II')
})

test('a list read that answers after a save never takes the page back to before it (#140 review)', async ({ page }) => {
  await createAccountWithHorses(page)
  // The read the window's focus starts gets its answer from the server at once, but the page gets it only after a save
  // has been answered: the list from before the save.
  let deliver: (() => Promise<void>) | undefined
  let readSeen: () => void = () => undefined
  const seen = new Promise<void>((resolve) => (readSeen = resolve))
  await page.route('**/api/v1/horses', async (route) => {
    if (route.request().method() !== 'GET' || deliver) return route.continue()
    const response = await route.fetch()
    deliver = () => route.fulfill({ response })
    readSeen()
  })
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })))
  await seen
  await page.getByLabel('Namn').fill('Sixten II')
  await saved(page)
  const answered = page.waitForResponse((r) => r.url().endsWith('/api/v1/horses') && r.request().method() === 'GET')
  await deliver?.()
  await answered

  await expect(page.getByLabel('Namn')).toHaveValue('Sixten II')
  await page.getByLabel('Ålder (år)').fill('13')
  await saved(page)
  await expect(horseNotice(page)).toHaveCount(0)
  expect(await serverHorse(page)).toMatchObject({ namn: 'Sixten II', alderAr: 13 })
})
