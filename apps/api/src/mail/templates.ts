// The account emails (#22, ADR 0009). Swedish text for a reader that leaves the API by email, not an API response, so
// this file is exempt from the Swedish-text lint rule (eslint.config.js); server-side i18n can come with English after
// the beta. Plain text, with the link on a line of its own so every mail client makes it clickable.
import type { Mail } from './mailer'

export function verificationMail(to: string, name: string, url: string): Mail {
  return {
    to,
    subject: 'Bekräfta din e-postadress för Fodr',
    text: [
      `Hej ${name}!`,
      '',
      'Klicka på länken för att bekräfta din e-postadress och logga in:',
      url,
      '',
      'Har du inte skapat ett konto hos Fodr kan du bortse från mejlet.',
    ].join('\n'),
  }
}

export function resetPasswordMail(to: string, name: string, url: string): Mail {
  return {
    to,
    subject: 'Återställ ditt lösenord för Fodr',
    text: [
      `Hej ${name}!`,
      '',
      'Klicka på länken för att välja ett nytt lösenord. Länken gäller i en timme:',
      url,
      '',
      'Har du inte bett om ett nytt lösenord kan du bortse från mejlet; ditt lösenord är oförändrat.',
    ].join('\n'),
  }
}

export function magicLinkMail(to: string, url: string): Mail {
  return {
    to,
    subject: 'Logga in på Fodr',
    text: [
      'Hej!',
      '',
      'Klicka på länken för att logga in. Länken gäller i fem minuter och kan bara användas en gång:',
      url,
      '',
      'Har du inte bett om att logga in kan du bortse från mejlet.',
    ].join('\n'),
  }
}
