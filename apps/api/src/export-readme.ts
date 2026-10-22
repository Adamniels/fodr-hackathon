// The README in a user's export (#40), in Swedish, as the user reads it. It leaves as a file in the archive, like an
// email, so it is the API's text rather than a code the web app turns into text (ADR 0013, ADR 0014).
export const EXPORT_README = `Din export från Fodr
====================

Det här är allt Fodr har sparat om dig, som det såg ut när exporten gjordes.

account.json       Ditt konto: namn, e-post, om adressen är bekräftad, roll, och när det skapades och ändrades.
sessions.json      De enheter du är inloggad på: när, från vilken IP-adress och med vilken webbläsare.
ai-usage.json      Dina frågor till AI:n: vilken funktion, vilken modell, antal tokens och uppskattad kostnad.
horses/            En mapp per häst:
  profile.json     Hästens profil.
  analyses.json    Grovfoderanalyserna med värdena, och AI:ns egen avläsning av rapporten.
  reports/         De analysrapporter du laddade upp, som originalfiler.
  plans.json       De sparade foderplanerna, var och en med sin förklaring och vilken AI-modell som skrev den.
  journal.json     Journalen.

missing-reports.json  Finns bara om en rapport inte kunde hämtas: vilka som saknas. Hör av dig, så tar vi fram dem.

Filerna är JSON, så de kan läsas av andra program. Tider anges i UTC.
`
