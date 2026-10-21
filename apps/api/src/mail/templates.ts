// The account emails (#22, ADR 0009). Swedish text for a reader that leaves the API by email, not an API response, so
// this file is exempt from the Swedish-text lint rule (eslint.config.js); server-side i18n can come with English after
// the beta. Plain text, with the link on a line of its own so every mail client makes it clickable. No mail holds the
// account name: anyone can choose it, so it could carry a message that seems to come from Fodr.
import type { Mail } from './mailer'

export function verificationMail(to: string, url: string): Mail {
  return {
    to,
    subject: 'Bekräfta din e-postadress för Fodr',
    text: [
      'Hej!',
      '',
      'Klicka på länken för att bekräfta din e-postadress och logga in:',
      url,
      '',
      'Har du inte skapat ett konto hos Fodr kan du bortse från mejlet.',
    ].join('\n'),
  }
}

/** Also sent when someone signs up with an email whose account is not verified yet: choosing a password proves it. */
export function resetPasswordMail(to: string, url: string): Mail {
  return {
    to,
    subject: 'Välj lösenord för Fodr',
    text: [
      'Hej!',
      '',
      'Klicka på länken för att välja ett nytt lösenord för ditt konto hos Fodr. Länken gäller i en timme:',
      url,
      '',
      'Har du inte bett om det kan du bortse från mejlet; ingenting har ändrats.',
    ].join('\n'),
  }
}

/** Sent when someone signs up with the email of a verified account; nothing about the account changes. */
export function accountExistsMail(to: string, loginUrl: string): Mail {
  return {
    to,
    subject: 'Du har redan ett konto hos Fodr',
    text: [
      'Hej!',
      '',
      'Någon försökte skapa ett konto hos Fodr med din e-postadress, men du har redan ett. Logga in här, eller välj',
      '"Glömt lösenordet?" om du inte minns det:',
      loginUrl,
      '',
      'Var det inte du kan du bortse från mejlet; ditt konto är oförändrat.',
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
