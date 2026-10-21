// The account mail the API sent, read from the Compose Mailpit like a user reads their inbox (#23). Tests use a unique
// address each, so parallel workers and retries never read each other's mail and nothing is ever deleted.
const MAILPIT = `http://127.0.0.1:${process.env.MAILPIT_UI_PORT ?? '8025'}/api/v1`

/** Where the e2e run serves the web app (playwright.config.ts); the mailed links point here. */
export const E2E_WEB = 'http://localhost:5174'

interface MailSummary {
  ID: string
  To: { Address: string }[]
}

export interface ReceivedMail {
  subject: string
  text: string
}

/** Mail to the address, newest first. */
async function messagesTo(address: string): Promise<MailSummary[]> {
  const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${address}"`)}&limit=20`)
  if (!res.ok) throw new Error(`Mailpit answered ${String(res.status)}; start it with \`docker compose up --wait\`.`)
  const { messages } = (await res.json()) as { messages: MailSummary[] }
  return messages.filter((m) => m.To.some((to) => to.Address === address))
}

/** The newest mail to the address whose subject matches, waiting for it (mail is sent after the reply). */
export async function waitForMail(address: string, subject: RegExp, timeoutMs = 10000): Promise<ReceivedMail> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    for (const message of await messagesTo(address)) {
      const res = await fetch(`${MAILPIT}/message/${message.ID}`)
      const mail = (await res.json()) as { Subject: string; Text: string }
      if (subject.test(mail.Subject)) return { subject: mail.Subject, text: mail.Text }
    }
    if (Date.now() > deadline) throw new Error(`No mail to ${address} matching ${String(subject)}`)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

/** How many mails went to the address. */
export async function mailCount(address: string): Promise<number> {
  return (await messagesTo(address)).length
}

/** The app's link in a mail (on the e2e web address), never another link the text may hold. */
export function linkIn(mail: ReceivedMail, base = E2E_WEB): string {
  const link = mail.text.split(/\s+/).find((word) => word.startsWith(`${base}/`))
  if (!link) throw new Error(`No link to ${base} in: ${mail.text}`)
  return link
}

/** An address no other test or earlier run uses. */
export function uniqueEmail(name: string): string {
  return `${name}+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@example.se`
}
