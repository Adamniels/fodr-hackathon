import { readFile } from 'node:fs/promises'
import { strFromU8, unzipSync } from 'fflate'
import { createAccountWithHorses, expect, goToStep, test, uploadExample } from './support/helpers'

// My data (CF8): what a user can take with them.

test('the export holds the horses, their analyses with the report, plans and journal (CF8, #40)', async ({ page }) => {
  const account = await createAccountWithHorses(page)
  await goToStep(page, 'Analysen')
  await uploadExample(page)
  await page.getByRole('button', { name: /Räkna fram foderplan/ }).click()
  await page.getByRole('button', { name: 'Spara planen i journalen' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Foderplan sparad' })).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Exportera mina data' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^fodr-export-\d{4}-\d{2}-\d{2}\.zip$/)
  const archive = unzipSync(new Uint8Array(await readFile(await file.path())))
  const names = Object.keys(archive)

  expect(JSON.parse(strFromU8(archive['account.json']))).toMatchObject({ email: account.email })
  const sixten = names.find((n) => /^horses\/sixten-[0-9a-f]{8}\/profile\.json$/.test(n))?.replace('/profile.json', '')
  expect(sixten).toBeDefined()
  for (const part of ['analyses.json', 'plans.json', 'journal.json']) expect(names).toContain(`${sixten}/${part}`)
  expect(names.some((n) => n.startsWith(`${sixten}/reports/`) && n.endsWith('.pdf'))).toBe(true)
  expect(JSON.parse(strFromU8(archive[`${sixten}/journal.json`]))).toHaveLength(1)
  expect(names.some((n) => n.startsWith('horses/pysen-'))).toBe(true)
})
