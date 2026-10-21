// URLs for every horse and step (#21, ADR 0012): reload, back and deep links keep the horse and step.
import type { Page } from '@playwright/test'
import { enterDemo, expect, goToStep, horseList, loadExamplePlan, logIn, test, type Step } from './support/helpers'

async function expectOn(page: Page, horse: string, step: Step): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(horse)
  await expect(
    page.getByRole('navigation', { name: 'Steg' }).getByRole('button', { name: new RegExp(`${step}$`) }),
  ).toHaveAttribute('aria-current', 'page')
}

const STEP_URL = /\/horses\/[^/]+\/(profile|analysis|plan|journal)$/

test('a deep link opens the right horse and step', async ({ page }) => {
  await enterDemo(page)
  await horseList(page).getByRole('button', { name: 'Pysen' }).click()
  await goToStep(page, 'Journal')
  await expect(page).toHaveURL(STEP_URL)
  const link = page.url()

  await page.goto('/')
  await page.goto(link)
  await expectOn(page, 'Pysen', 'Journal')
})

test('reload keeps the horse and step', async ({ page }) => {
  await enterDemo(page)
  await horseList(page).getByRole('button', { name: 'Pysen' }).click()
  await goToStep(page, 'Analysen')
  await page.reload()
  await expectOn(page, 'Pysen', 'Analysen')
})

test('back and forward walk through steps and horses', async ({ page }) => {
  await enterDemo(page)
  await expectOn(page, 'Sixten', 'Hästen')
  await goToStep(page, 'Analysen')
  await horseList(page).getByRole('button', { name: 'Pysen' }).click()
  await expectOn(page, 'Pysen', 'Analysen')

  await page.goBack()
  await expectOn(page, 'Sixten', 'Analysen')
  await page.goBack()
  await expectOn(page, 'Sixten', 'Hästen')
  await page.goForward()
  await expectOn(page, 'Sixten', 'Analysen')
})

test('a plan link without an analysis opens the analysis step', async ({ page }) => {
  // The analysis is not stored yet (#26), so after a reload the plan has nothing to plan from.
  await loadExamplePlan(page)
  await expect(page).toHaveURL(/\/plan$/)
  await page.reload()
  await expectOn(page, 'Sixten', 'Analysen')
  await expect(page).toHaveURL(/\/analysis$/)
})

test('a link to an unknown horse opens the first horse', async ({ page }) => {
  await enterDemo(page)
  await page.goto('/horses/finns-inte/journal')
  await expectOn(page, 'Sixten', 'Hästen')
})

test('a deep link while logged out asks for login, then opens the page', async ({ page }) => {
  await enterDemo(page)
  await horseList(page).getByRole('button', { name: 'Pysen' }).click()
  await goToStep(page, 'Journal')
  const link = page.url()
  await horseList(page).getByRole('button', { name: 'Logga ut' }).click()

  await page.goto(link)
  const dialog = page.getByRole('dialog', { name: 'Logga in' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('E-post').fill('demo@fodr.se')
  await dialog.getByRole('button', { name: 'Logga in', exact: true }).click()
  await expectOn(page, 'Pysen', 'Journal')
})

test('the site root shows the landing page to a logged-in user, who can continue', async ({ page }) => {
  await enterDemo(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /Rätt foder till din häst/ })).toBeVisible()
  await page.getByRole('button', { name: 'Fortsätt som Anna Demo' }).click()
  await expectOn(page, 'Sixten', 'Hästen')
})

test('an unknown address shows a page-not-found page with a way back', async ({ page }) => {
  await page.goto('/finns/inte')
  await expect(page.getByRole('heading', { name: 'Sidan finns inte' })).toBeVisible()
  await page.getByRole('link', { name: 'Till startsidan' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Rätt foder till din häst/ })).toBeVisible()
})

test('the login dialog has its own address', async ({ page }) => {
  await logIn(page, 'nobody@example.se')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByRole('button', { name: 'Stäng' }).click()
  await expect(page).toHaveURL(/\/$/)
})
