// CF1 in the browser against the real API (#23): sign up with verification, log in and out, a wrong password,
// magic link and password reset, with the mail read from Mailpit.
import { createAccount, expect, horseList, logIn, PASSWORD, seededAccount, test } from './support/helpers'
import { E2E_WEB, linkIn, mailCount, uniqueEmail, waitForMail } from './support/mailpit'

const landingHeading = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { level: 1, name: /Rätt foder till din häst/ })

async function openDialog(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Logga in', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Logga in' })
  await expect(dialog).toBeVisible()
  return dialog
}

test('the landing page offers getting started, which opens sign-up, and login (#29)', async ({ page }) => {
  await page.goto('/')
  await expect(landingHeading(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Logga in', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Kom igång' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Logga in' })
  await expect(dialog.getByRole('heading', { name: 'Skapa konto' })).toBeVisible()
  await expect(dialog.getByLabel('Namn')).toBeVisible()
})

test('the seeded demo account opens with Sixten and Pysen (#29)', async ({ page }) => {
  await seededAccount(page)
  await expect(horseList(page).getByRole('button', { name: 'Sixten' })).toBeVisible()
  await expect(horseList(page).getByRole('button', { name: 'Pysen' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sixten')
})

test('sign up, verify the email from the inbox, and land signed in', async ({ page }) => {
  const email = uniqueEmail('ny')
  const dialog = await openDialog(page)
  await dialog.getByRole('button', { name: 'Ny här? Skapa konto' }).click()
  await dialog.getByLabel('Namn').fill('Ny Användare')
  await dialog.getByLabel('E-post').fill(email)
  await dialog.getByLabel('Lösenord').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Skapa konto', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Kolla din e-post' })).toBeVisible()
  await expect(dialog.getByText(email)).toBeVisible()

  await page.goto(linkIn(await waitForMail(email, /Bekräfta/)))
  await expect(horseList(page).getByText('Ny Användare')).toBeVisible()
  await expect(horseList(page).getByText(email)).toBeVisible()
})

test('a password login before verification asks to verify, and can send the link again', async ({ page }) => {
  const email = uniqueEmail('overifierad')
  const dialog = await openDialog(page)
  await dialog.getByRole('button', { name: 'Ny här? Skapa konto' }).click()
  await dialog.getByLabel('Namn').fill('Väntar')
  await dialog.getByLabel('E-post').fill(email)
  await dialog.getByLabel('Lösenord').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Skapa konto', exact: true }).click()
  await waitForMail(email, /Bekräfta/)

  await logIn(page, email)
  const loginDialog = page.getByRole('dialog', { name: 'Logga in' })
  await expect(loginDialog.getByText('Bekräfta din e-postadress först')).toBeVisible()
  await expect(horseList(page)).toHaveCount(0)
  const before = await mailCount(email)
  await loginDialog.getByRole('button', { name: 'Skicka länken igen' }).click()
  await expect(loginDialog.getByText('Vi har skickat en ny länk.')).toBeVisible()
  await expect.poll(() => mailCount(email)).toBeGreaterThan(before)
})

test('log out, then log in again with the password', async ({ page }) => {
  const account = await createAccount(page, 'E2E Test', 'e2e@example.se')
  await horseList(page).getByRole('button', { name: 'Logga ut' }).click()
  await expect(landingHeading(page)).toBeVisible()
  await page.goto('/horses')
  await expect(page.getByRole('dialog', { name: 'Logga in' })).toBeVisible()

  await logIn(page, account.email, account.password)
  await expect(horseList(page).getByText('E2E Test')).toBeVisible()
})

test('the password is checked: a wrong one is refused', async ({ page }) => {
  const account = await createAccount(page, 'Rätt Lösen', 'losen@example.se')
  await horseList(page).getByRole('button', { name: 'Logga ut' }).click()

  await logIn(page, account.email, 'fel-losenord-999')
  await expect(page.getByText('Fel e-postadress eller lösenord.')).toBeVisible()
  await expect(horseList(page)).toHaveCount(0)
})

test('an unknown email gets the same answer as a wrong password', async ({ page }) => {
  await logIn(page, uniqueEmail('okand'))
  await expect(page.getByText('Fel e-postadress eller lösenord.')).toBeVisible()
})

test('log in with a link from the inbox', async ({ page }) => {
  const account = await createAccount(page, 'Länk Användare', 'lank@example.se')
  await horseList(page).getByRole('button', { name: 'Logga ut' }).click()

  const dialog = await openDialog(page)
  await dialog.getByRole('button', { name: 'Logga in med en länk i stället' }).click()
  await dialog.getByLabel('E-post').fill(account.email)
  await dialog.getByRole('button', { name: 'Skicka inloggningslänk' }).click()
  await expect(dialog.getByRole('heading', { name: 'Kolla din e-post' })).toBeVisible()

  await page.goto(linkIn(await waitForMail(account.email, /Logga in/)))
  await expect(horseList(page).getByText('Länk Användare')).toBeVisible()
})

test('reset a forgotten password from the inbox: the new one works, the old one not', async ({ page }) => {
  const account = await createAccount(page, 'Glömsk', 'glomsk@example.se')
  await horseList(page).getByRole('button', { name: 'Logga ut' }).click()

  const dialog = await openDialog(page)
  await dialog.getByRole('button', { name: 'Glömt lösenordet?' }).click()
  await dialog.getByLabel('E-post').fill(account.email)
  await dialog.getByRole('button', { name: 'Skicka länk för nytt lösenord' }).click()
  await expect(dialog.getByRole('heading', { name: 'Kolla din e-post' })).toBeVisible()

  const resetLink = linkIn(await waitForMail(account.email, /lösenord/))
  await page.goto(resetLink)
  await expect(page.getByRole('heading', { name: 'Välj ett nytt lösenord' })).toBeVisible()
  await page.getByLabel('Nytt lösenord').fill('nytt-losenord-456')
  await page.getByRole('button', { name: 'Spara lösenordet' }).click()
  await expect(page.getByText('Lösenordet är bytt.')).toBeVisible()

  // A used link does not work twice.
  await page.goto(resetLink)
  await expect(page.getByText('Länken är ogiltig eller har gått ut.')).toBeVisible()

  await logIn(page, account.email, PASSWORD)
  await expect(page.getByText('Fel e-postadress eller lösenord.')).toBeVisible()
  await logIn(page, account.email, 'nytt-losenord-456')
  await expect(horseList(page).getByText('Glömsk')).toBeVisible()
})

test('an invalid or expired reset link says so and offers a new one', async ({ page }) => {
  await page.goto('/reset-password?error=INVALID_TOKEN')
  await expect(page.getByText('Länken är ogiltig eller har gått ut.')).toBeVisible()
  await page.getByRole('link', { name: 'Be om en ny länk' }).click()
  await expect(page.getByRole('dialog', { name: 'Logga in' })).toBeVisible()
})

test('a new account starts empty after another one was used in the browser', async ({ page }) => {
  await seededAccount(page)
  await horseList(page).getByRole('button', { name: 'Logga ut' }).click()
  await createAccount(page, 'Tom Användare', 'tom@example.se')
  await expect(horseList(page).getByRole('listitem')).toHaveCount(1)
  await expect(horseList(page).getByRole('button', { name: 'Lägg till häst' })).toBeVisible()
})

test('unmocked api request fails the test', async ({ page }) => {
  // Guard for the mock harness. The body asserts nothing on purpose: the only thing that can fail this
  // test is the teardown check in helpers.ts, so it stays green only while that guard works.
  test.fail()
  await page.goto('/')
  await page.evaluate(() => fetch('/api/okand', { method: 'POST' }).catch(() => undefined))
})

test('api v1 and auth requests reach the server', async ({ page }) => {
  // Guard for the mock harness: /api/v1 and /api/auth belong to the real backend, so the mock lets them through.
  await page.goto('/')
  const statuses = await page.evaluate(() =>
    Promise.all(['/api/v1/health', '/api/v1/me', '/api/auth/ok'].map((path) => fetch(path).then((r) => r.status))),
  )
  expect(statuses).toEqual([200, 401, 200])
})

test('settled waits for a request that starts after it is called', async ({ page, ai }) => {
  // Guard for the mock harness: settled() must measure its quiet window from when it is called, or a request
  // that arrives just after a quiet period is missed.
  await page.goto('/')
  await page.waitForTimeout(700) // let the harness go quiet first
  await page.evaluate(() => {
    setTimeout(() => void fetch('/api/forklaring', { method: 'POST', body: '{}' }), 100)
  })
  await ai.settled()
  expect(ai.calls('forklaring')).toHaveLength(1)
})

test('accounts do not share horses', async ({ page }) => {
  await createAccount(page, 'Användare A', 'a@example.se')
  await page.getByRole('button', { name: 'Lägg till din första häst' }).click()
  await page.getByLabel('Namn').fill('Alfa')
  await expect(horseList(page).getByRole('button', { name: 'Alfa' })).toBeVisible()
  await horseList(page).getByRole('button', { name: 'Logga ut' }).click()

  await createAccount(page, 'Användare B', 'b@example.se')
  await expect(horseList(page).getByRole('button', { name: 'Alfa' })).toHaveCount(0)
})

test('a verification link signs in to the new account, also in a browser signed in to another (#23 review)', async ({
  page,
}) => {
  const email = uniqueEmail('newfirst')
  const dialog = await openDialog(page)
  await dialog.getByRole('button', { name: 'Ny här? Skapa konto' }).click()
  await dialog.getByLabel('Namn').fill('Egen Användare')
  await dialog.getByLabel('E-post').fill(email)
  await dialog.getByLabel('Lösenord').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Skapa konto', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Kolla din e-post' })).toBeVisible()

  await seededAccount(page)
  await page.goto(linkIn(await waitForMail(email, /Bekräfta/)))
  await expect(horseList(page).getByText('Egen Användare')).toBeVisible()
  await expect(horseList(page).getByRole('button', { name: 'Sixten' })).toHaveCount(0)

  await horseList(page).getByRole('button', { name: 'Logga ut' }).click()
  await page.goto('/horses')
  await expect(page.getByRole('dialog', { name: 'Logga in' })).toBeVisible()
})

test('a password reset in a signed-in browser ends that session there too (#23 review)', async ({ page }) => {
  const account = await createAccount(page, 'Inloggad', 'inloggad@example.se')
  await page.request.post('/api/auth/request-password-reset', {
    data: { email: account.email, redirectTo: '/reset-password' },
    headers: { origin: E2E_WEB },
  })
  await page.goto(linkIn(await waitForMail(account.email, /lösenord/)))
  await page.getByLabel('Nytt lösenord').fill('nytt-losenord-789')
  await page.getByRole('button', { name: 'Spara lösenordet' }).click()
  await page.getByRole('link', { name: 'Logga in' }).click()
  await expect(page.getByRole('dialog', { name: 'Logga in' })).toBeVisible()
  await expect(horseList(page)).toHaveCount(0)
})

test('an expired link on the login page says so and offers a new one (#23 review)', async ({ page }) => {
  await page.goto('/login?error=TOKEN_EXPIRED')
  const dialog = page.getByRole('dialog', { name: 'Logga in' })
  await expect(dialog.getByText('Länken är ogiltig eller har gått ut.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Skicka en ny länk' }).click()
  await expect(dialog.getByRole('button', { name: 'Skicka inloggningslänk' })).toBeVisible()
})

test('a real account returns to the page it asked for after logging in (#23 review)', async ({ page }) => {
  const account = await createAccount(page, 'Djuplänk', 'djuplank@example.se')
  await page.getByRole('button', { name: 'Lägg till din första häst' }).click()
  await page.getByLabel('Namn').fill('Blixten')
  await page
    .getByRole('navigation', { name: 'Steg' })
    .getByRole('button', { name: /Journal$/ })
    .click()
  await expect(page).toHaveURL(/\/journal$/)
  const link = page.url()
  await horseList(page).getByRole('button', { name: 'Logga ut' }).click()

  await page.goto(link)
  const dialog = page.getByRole('dialog', { name: 'Logga in' })
  await dialog.getByLabel('E-post').fill(account.email)
  await dialog.getByLabel('Lösenord').fill(account.password)
  await dialog.getByRole('button', { name: 'Logga in', exact: true }).click()
  await expect(page).toHaveURL(link)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blixten')
})

test('a name of only spaces is refused (#23 review)', async ({ page }) => {
  const dialog = await openDialog(page)
  await dialog.getByRole('button', { name: 'Ny här? Skapa konto' }).click()
  await dialog.getByLabel('Namn').fill('   ')
  await dialog.getByLabel('E-post').fill(uniqueEmail('blank'))
  await dialog.getByLabel('Lösenord').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Skapa konto', exact: true }).click()
  await expect(dialog.getByText('Skriv ditt namn.')).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Kolla din e-post' })).toHaveCount(0)
})
