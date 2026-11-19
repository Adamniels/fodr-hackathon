// Every page has a title of its own in the browser tab, the page and then "Fodr" (#195, WCAG 2.4.2 Page Titled), and
// it changes with the page when the app moves on without a reload.
import {
  createAccountWithHorses,
  expect,
  goToStep,
  grantAdmin,
  horseList,
  seededAccount,
  test,
} from './support/helpers'

test('a horse step names the step and the horse, and changes with the step and the horse', async ({ page }) => {
  await seededAccount(page)
  await expect(page).toHaveTitle('Om Sixten – Fodr')
  await goToStep(page, 'Analysen')
  await expect(page).toHaveTitle('Grovfoderanalysen för Sixten – Fodr')
  await goToStep(page, 'Foderplan')
  await expect(page).toHaveTitle('Foderplan för Sixten – Fodr')
  await goToStep(page, 'Journal')
  await expect(page).toHaveTitle('Journal för Sixten – Fodr')
  await horseList(page).getByRole('button', { name: 'Pysen' }).click()
  await expect(page).toHaveTitle('Journal för Pysen – Fodr')
  await page.reload()
  await expect(page).toHaveTitle('Journal för Pysen – Fodr')
})

test('the public pages are titled, and the title follows a link inside the app', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Foderplan från din grovfoderanalys – Fodr')
  await page.getByRole('button', { name: 'Logga in', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Logga in' })).toBeVisible()
  await expect(page).toHaveTitle('Logga in – Fodr')
  await page.getByRole('button', { name: 'Stäng' }).click()
  await expect(page).toHaveTitle('Foderplan från din grovfoderanalys – Fodr')

  await page.getByRole('link', { name: 'Villkor' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Villkor för Fodr' })).toBeVisible()
  await expect(page).toHaveTitle('Villkor – Fodr')
  await page.goto('/integritet')
  await expect(page).toHaveTitle('Integritetspolicy – Fodr')
  await page.goto('/reset-password')
  await expect(page).toHaveTitle('Välj ett nytt lösenord – Fodr')
})

test('the product administration is titled for an admin', async ({ page }) => {
  const account = await createAccountWithHorses(page)
  await grantAdmin(page, account)
  await page.getByRole('link', { name: 'Produkter' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Produkter' })).toBeVisible()
  await expect(page).toHaveTitle('Produkter – Fodr')

  const first = page.getByRole('table').getByRole('link').first()
  const name = await first.textContent()
  await first.click()
  await expect(page.getByRole('heading', { level: 1, name: name ?? '' })).toBeVisible()
  await expect(page).toHaveTitle(`${name ?? ''} – Fodr`)

  await page.getByRole('link', { name: 'Alla produkter' }).click()
  await page.getByRole('link', { name: 'Ny produkt' }).click()
  await expect(page).toHaveTitle('Ny produkt – Fodr')
})

test('an address that leads nowhere says so in the title', async ({ page }) => {
  await page.goto('/finns/inte')
  await expect(page.getByRole('heading', { name: 'Sidan finns inte' })).toBeVisible()
  await expect(page).toHaveTitle('Sidan finns inte – Fodr')

  // Under a horse, inside the workspace.
  await seededAccount(page)
  await page.goto(page.url().replace(/\/profile$/, '/finns-inte'))
  await expect(page.getByRole('heading', { name: 'Sidan finns inte' })).toBeVisible()
  await expect(page).toHaveTitle('Sidan finns inte – Fodr')
})
