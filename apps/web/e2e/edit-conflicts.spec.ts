import type { Browser, Page } from '@playwright/test'
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
  const notice = page.getByRole('alert').filter({ hasText: 'Hästen har ändrats på en annan enhet' })
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
  await notice.getByRole('button', { name: 'Använd de nya' }).click()
  await expect(notice).toBeHidden()
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
  const notice = page.getByRole('alert').filter({ hasText: 'Analysen har ändrats på en annan enhet' })
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
