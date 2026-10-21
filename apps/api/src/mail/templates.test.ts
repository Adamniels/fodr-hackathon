import { describe, expect, it } from 'vitest'
import { accountExistsMail, magicLinkMail, resetPasswordMail, verificationMail } from './templates'

const URL = 'http://localhost:5173/api/auth/x?token=abc'

describe('the account emails', () => {
  it.each([
    ['verification', verificationMail('anna@example.se', URL), /Bekräfta/],
    ['password', resetPasswordMail('anna@example.se', URL), /lösenord/],
    ['account exists', accountExistsMail('anna@example.se', URL), /redan ett konto/],
    ['magic link', magicLinkMail('anna@example.se', URL), /Logga in/],
  ])('%s goes to the address with its subject and the link on a line of its own', (_name, mail, subject) => {
    expect(mail.to).toBe('anna@example.se')
    expect(mail.subject).toMatch(subject)
    expect(mail.text.split('\n')).toContain(URL)
  })
})
