// Accessibility checks with axe (#44): WCAG 2.2 level AA, the target in docs/accessibility.md, plus axe's best
// practices (landmarks, heading order). Every test's final page is checked by the auto fixture in helpers.ts; a test
// calls expectAccessible at the states in between that its final page does not show (an open dialog, an error).

import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa', 'best-practice']

/** The page as it is now has no axe violation; a failure lists each rule with the elements that break it. */
export async function expectAccessible(page: Page, state = 'page') {
  // The check is of the settled page, from its top. A dialog fading in is half transparent, which axe measures as low
  // contrast; and a field the test left scrolled under a sticky bar (the step tabs) counts as covered, though any field
  // passes under it while scrolling and a focused one is scrolled clear of it (scroll-padding-top in index.css).
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  })
  await expect
    .poll(async () => {
      const before = await page.evaluate(() => window.scrollY)
      await page.waitForTimeout(100)
      return (await page.evaluate(() => window.scrollY)) === before
    })
    .toBe(true)
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const found = violations.map((v) => ({ rule: v.id, help: v.help, elements: v.nodes.map((n) => n.target.join(' ')) }))
  expect(found, `axe violations (${state}, ${page.url()})`).toEqual([])
}
