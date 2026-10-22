// Reads the mail the API sent through the Compose Mailpit, over Mailpit's HTTP API (ADR 0006, ADR 0009).
const MAILPIT = `http://127.0.0.1:${process.env.MAILPIT_UI_PORT ?? '8025'}/api/v1`

interface MailSummary {
  ID: string
  To: { Address: string }[]
  Subject: string
}

export interface ReceivedMail {
  subject: string
  text: string
}

/** Deletes every message, so a test only sees its own mail. */
export async function clearMail(): Promise<void> {
  const res = await fetch(`${MAILPIT}/messages`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Mailpit answered ${String(res.status)}; start it with \`docker compose up --wait\`.`)
}

async function messagesTo(address: string): Promise<MailSummary[]> {
  const res = await fetch(`${MAILPIT}/messages?limit=50`)
  const { messages } = (await res.json()) as { messages: MailSummary[] }
  return messages.filter((m) => m.To.some((to) => to.Address === address))
}

/**
 * The newest message to the address, or the newest with this subject, waiting for it to arrive (mail is sent without
 * blocking the response).
 */
export async function waitForMail(address: string, timeoutMs = 5000, subject?: string): Promise<ReceivedMail> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const newest = (await messagesTo(address)).find((m) => subject === undefined || m.Subject === subject)
    if (newest) {
      const res = await fetch(`${MAILPIT}/message/${newest.ID}`)
      const { Subject, Text } = (await res.json()) as { Subject: string; Text: string }
      return { subject: Subject, text: Text }
    }
    if (Date.now() > deadline) throw new Error(`No mail to ${address} within ${String(timeoutMs)} ms`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** How many messages went to the address. */
export async function mailCount(address: string): Promise<number> {
  return (await messagesTo(address)).length
}

/** The app's link in a mail's text (on BASE_URL), never another link the text may hold. */
export function linkIn(mail: ReceivedMail, base = 'http://localhost:3000'): URL {
  const link = mail.text.split(/\s+/).find((word) => word.startsWith(`${base}/`))
  if (!link) throw new Error(`No link to ${base} in: ${mail.text}`)
  return new URL(link)
}
