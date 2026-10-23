// The pages at 320 CSS pixels wide (#44, WCAG 1.4.10 Reflow), the width of a small phone and of a 1280 pixel screen
// zoomed to 400 %: nothing makes the page scroll sideways, and each page still passes the accessibility checks. A table
// wider than the screen scrolls in a box of its own, which takes keyboard focus so it can be scrolled without a mouse.
import type { Page } from '@playwright/test'
import { expectAccessible } from './support/accessibility'
import {
  createAccountWithHorses,
  expect,
  goToStep,
  grantAdmin,
  seededAccount,
  showExamplePlan,
  test,
} from './support/helpers'

test.use({ viewport: { width: 320, height: 720 } })

async function expectReflows(page: Page, state: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, `page width (${state})`).toBeLessThanOrEqual(innerWidth)
  await expectAccessible(page, `${state} at 320 px`)
}

test('the landing page fits a small phone', async ({ page }) => {
  await page.goto('/')
  await expectReflows(page, 'landing page')
})

test('the horse profile and the menu fit a small phone', async ({ page }) => {
  await createAccountWithHorses(page)
  await expectReflows(page, 'profile')
  await page.getByRole('button', { name: 'Visa hästar och meny' }).click()
  await expect(page.getByRole('complementary', { name: 'Hästar' })).toBeInViewport()
  await expectReflows(page, 'menu')
})

test('the menu on a small phone keeps focus while open, and Escape closes it (#44)', async ({ page }) => {
  await createAccountWithHorses(page)
  const menuButton = page.getByRole('button', { name: 'Visa hästar och meny' })
  await menuButton.click()
  const menu = page.getByRole('complementary', { name: 'Hästar' })
  await expect(menu.getByRole('button', { name: 'Stäng menyn' })).toBeFocused()
  // The page under the menu is out of reach: Tab moves among the menu's controls (or out to the browser).
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab')
    const behind = await page.evaluate(() => {
      const focused = document.activeElement
      return focused !== null && focused !== document.body && focused.closest('aside') === null
    })
    expect(behind, `focus after ${String(i + 1)} Tab`).toBe(false)
  }
  await page.keyboard.press('Escape')
  await expect(menu).not.toBeInViewport()
  await expect(menuButton).toBeFocused()
})

test('the analysis and the plan fit a small phone', async ({ page }) => {
  await createAccountWithHorses(page)
  await showExamplePlan(page)
  await expect(page.getByText(/Foderplanen är ett beslutsstöd/)).toBeVisible()
  await expectReflows(page, 'plan')
  await goToStep(page, 'Analysen')
  await expectReflows(page, 'analysis')
})

test('the journal fits a small phone', async ({ page }) => {
  // Logged in on a wide screen: under 820 px the landing page's header offers getting started, and login from there.
  await page.setViewportSize({ width: 1280, height: 720 })
  await seededAccount(page)
  await page.setViewportSize({ width: 320, height: 720 })
  await goToStep(page, 'Journal')
  await expectReflows(page, 'journal')
})

test('the product administration fits a small phone', async ({ page }) => {
  const account = await createAccountWithHorses(page)
  await grantAdmin(page, account)
  await page.goto('/admin/products')
  await expect(page.getByRole('table')).toBeVisible()
  await expectReflows(page, 'product list')
})
