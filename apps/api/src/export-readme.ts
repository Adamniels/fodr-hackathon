// The README in a user's export (#40), in Swedish, as the user reads it. It leaves as a file in the archive, like an
// email, so it is the API's text rather than a code the web app turns into text (ADR 0013, ADR 0014).
export const EXPORT_README = `Din export från Fodr
====================

Det här är allt Fodr har sparat om dig, som det såg ut när exporten gjordes.

account.json       Ditt konto: namn, e-post och när det skapades.
ai-usage.json      Dina frågor till AI:n: vilken funktion, vilken modell, antal tokens och uppskattad kostnad.
horses/            En mapp per häst:
  profile.json     Hästens profil.
  analyses.json    Grovfoderanalyserna med värdena.
  reports/         De analysrapporter du laddade upp, som originalfiler.
  plans.json       De sparade foderplanerna, var och en med sin förklaring.
  journal.json     Journalen.

Filerna är JSON, så de kan läsas av andra program. Tider anges i UTC.
`
