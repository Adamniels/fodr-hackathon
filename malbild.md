# Fodr, målbild för hackathon-PoC

Senast uppdaterad: 2026-10-14. Lag: två personer. Antagen tid: 4 timmar.

## Problem

En hästägare betalar för en grovfoderanalys och får tillbaka en rapport med förkortningar som hen inte kan omsätta i praktiken. Hen vet inte om fodret räcker för just sin häst eller vilket tillskott som behövs. Följden blir gissningar, överutfodring och onödiga kostnader, och proteinöverskottet hamnar som kväve i gödseln.

## Demoscenario (live, förberedd analys)

1. **Profil.** Vi väljer en befintlig häst eller skapar en ny. Grunddata fylls i fält: vikt, eller bröstomfång och längd som räknas om till vikt, ålder, typ, hull, arbete och hälsa (fång, EMS). Fält som kan innehålla lite av varje, som nuvarande foder och hälsohistorik, får fritext. Där ställer agenten följdfrågor och gör om svaret till strukturerade värden.
2. **Analys.** Vi laddar upp en förberedd analysrapport som PDF eller foto. AI läser ut värdena, alla visas och kan rättas. Om analysen saknar mineraler står det tydligt, och schablonvärden används och märks som uppskattade.
3. **Beräkning.** Behov enligt SLU ställs mot vad grovfodret och det nuvarande fodret ger. Resultatet är en tabell över brister och överskott per näringsämne.
4. **Plan.** Billigaste fungerande kombinationen av en eller två produkter, med gram per dag och kronor per månad, plus det näst billigaste alternativet. AI förklarar planen på vanlig svenska. En rad visar proteinöverskottet som kg kväve per år. Fång, EMS eller kolik ger en hänvisning till veterinär.

Juryn ska minnas tre saker: värdena lästes ut och syns, profilen blev konkreta siffror, och listan täcker behoven, vilket kontrollen visar.

## Minsta fungerande scope

- Flera hästprofiler sparas lokalt, och man arbetar med en häst i taget.
- Hö och hösilage, räknat per kg ts.
- Alla näringsämnen som SLU-rapporten anger. Modellen är tabellstyrd, så fler ämnen betyder mer data, inte mer kod. Ett saknat värde behandlas som okänt, aldrig som noll.
- Produktdatabas med 15–25 svenska produkter i JSON.
- Urval genom uttömmande sökning över kombinationer av en eller två produkter, med regler för vad som fungerar tillsammans:
  - högst ett mineralfoder som bas,
  - inga näringsämnen över SLU:s maxgräns, inklusive det hästen redan äter,
  - Ca/P-kvot inom rekommenderat intervall,
  - dos inom tillverkarens rekommendation,
  - socker- och stärkelsegräns vid fång eller EMS, och produkter märkta olämpliga utesluts.
- Ett handräknat fall som körs som automatiskt test mot beräkningen.
- Trovärdiga syntetiska testfall: profiler och analysrapporter i ett neutralt, påhittat labbformat.

## Tekniska val

- Vite, React och TypeScript. Beräkning och urval är ren TypeScript utan beroenden.
- En liten serverfunktion håller API-nyckeln och anropar Claude. Under hackathonet körs allt lokalt.
- Claude Sonnet 5.5 läser PDF och bild direkt och ger strukturerad JSON, samt skriver följdfrågor och förklaringar.
- Data i JSON-filer: SLU-tabeller, produkter och schablonvärden för grovfoder.
- Arbetsfördelning: den ena styr och granskar Claude Code, den andra samlar produktdata och testar.

## Uttryckligen utanför

- Stallvy och planer för flera hästar samtidigt (finns med i pitchen som nästa steg).
- Konkurrentjämförelse.
- Exakthet på produktnivå: rimliga rekommendationer räcker för PoC:n.
- Riktig inloggning och databas, köp, provision och hosting för allmänheten. Konton finns som mock i webbläsaren (beslut 2026-10-14, eftersom UX bedöms).
- Bete som foderkälla, foderstat för föl, dräktiga och digivande ston, om det inte blir tid över.

## Beslut och antaganden under bygget (2026-10-14)

Källa för behoven är SLU Rapport 289, Utfodringsrekommendationer för häst (7:e uppl., 2013). Där SLU inte räcker har vi gjort antaganden. De är märkta ANTAGANDE i koden och "ej SLU" i gränssnittet:

- Vikt vid normalt hull uppskattas som ungefär 4 % per hullpoäng från 5, om ägaren inte anger den.
- Tabell 17:s kolumn "Arbete" för mikromineraler används från 25 % arbetstillägg (lätt arbete).
- Sockergräns vid fång eller EMS är cirka 100 g/kg ts (branschpraxis, finns inte i SLU 2013).
- Schablon för makromineraler och selen i grovfoder är typvärden för svenskt vallfoder, inte SLU. Mikromineraler kommer från SLU tabell 26 (timotej) och vitaminer från tabell 24.
- Ett ämne som saknas i analysen och saknar schablon räknas som okänt, aldrig som brist. Ett ämne som en produkt inte deklarerar räknas som noll.
- Bara vuxna hästar (från 3 år). Dräktighet, digivning och unghästar ingår inte.
- Urval: noll, en eller två produkter med högst ett mineralfoder, dos i steg inom tillverkarens intervall, och salt fylls på analytiskt. Rangordning: full täckning, sedan lägst kostnad, sedan färst produkter.
- AI-modell: Claude Sonnet 5.5. Utläsning och följdfrågor körs med effort low, förklaringen med medium. Ingen server-side fallback vid refusal, utan ett tydligt fel visas.
- Produktdata är platshållare tills verkliga deklarationer samlats in.

## Utbyggnad, beslutad 2026-10-14

1. **Hästens förutsättningar.** Ras som sätter typ och visar viktintervall (SLU tabell 2 och 33). Miljö med box eller lösdrift, utevistelse, klippt, täcke och temperatur, som ger kylatillägget. Prestanda som gren och nivå, som styr arbetstillägg, vitaminbehov och saltbehov.
2. **Känsligheter** som styr produktvalet: fång, EMS och PPID; magsår; korsförlamning (PSSM); luftvägar; ingrediensallergi (spannmål, lusern, soja, melass); tandproblem. Proteinkänslighet hanteras som ingrediensallergi plus ett lägre proteintak. Produkter får ingredienslista och foderform.
3. **Journal per häst.** Datum, vikt, hull och fritext, och varje foderplan sparas som en version. AI hittar mönster och flaggar när veterinär behövs. Koden räknar om planen.
4. Väntar: dräktiga och digivande ston (om tid finns), unghästar och bete (efter hackathon). Journalen sparas lokalt i webbläsaren.
5. **Konton (mock).** Inloggning med e-post, lösenordet kontrolleras inte. Hästar och journal sparas per användare i webbläsaren. Demokontot (demo@fodr.se) har Sixten och Pysen. All lagring går genom `auth.ts` och `storage.ts`, så att riktig inloggning och databas kan kopplas in där efter hackathon. En häst ska då kunna ha flera användare, för stallet.

## Produkt- och testdata (2026-10-14)

- Produkter importeras från kollegans butiksdata med `app/scripts/importera-produkter.mjs`. Bara de 15 produkterna i `produktval.json` får väljas av urvalet. Övriga kan väljas som dagens foder.
- Utanför urvalet tills data kompletterats: produkter flaggade "kontrollera" (bl.a. Granngårdens mineralfoder utan Ca och P, Trikem E+Selen utan selenvärde), saltstenar (doseras inte i gram) och Hööks produkter utan deklaration.
- Urvalet måste täcka analyserade ämnen samt Ca, P, Mg, Na och Se. Uppskattade mikromineraler och vitaminer styr inte (SLU: vallfoder av god kvalitet räcker normalt) och visas som "Osäkert".
- Kompletta mineraltillskott (Trikem Minerals, Brogaarden Vitamins & Minerals) räknas som mineralfoder, så att högst ett väljs.
- Demoanalys är A01 ur kollegans testdata. Grovfoderflaggor följer SLU; facit använder Eurofins gränser (proteinkvot 5,5–6,5) och flaggar hög Ca/P, vilket vi medvetet inte gör.
- Uppskjutet: jämförelse med Sverigestatistiken, eftersom jämförelsegruppen (klöverandel, skörd) är okänd för användarens foder.

## Känsligheter och vitamin E (2026-10-14)

- Vitamin E styr alltid urvalet, eftersom alla planer gäller stallfoderstat (bete ingår inte) och SLU anger att E-halten i hösilage sjunker vid lagring.
- Känsligheter: fång, EMS, PPID och korsförlamning kräver lågt socker och stärkelse; magsår väljer bort spannmål och produkter med över 100 g stärkelse per kg; luftvägar väljer bort pulver; ingredienser att undvika väljs bort; proteinkänslighet väljer bort proteinfoder och varnar för mer än 30 % proteinöverskott. Tandproblem ger råd men påverkar inte urvalet.
- Bortvalda urvalsprodukter redovisas med skäl. Dagens foder granskas mot samma regler.
- Svaghet: ingredienserna härleds ur butikernas beskrivningar och missar mycket (t.ex. spannmål i de flesta pellets). Magsårsregeln fångar spannmålsfoder via stärkelsen, men allergifiltret gör det inte. Ingredienslistor för de vanligaste produkterna bör fyllas i för hand.

## Journal (2026-10-14)

- Per häst och användare: datum, vikt, hull, fritext och sparade planversioner. En ny mätning kan uppdatera profilen, och då räknar koden om planen.
- Utan AI: trend i vikt och hull, viktförändring per vecka, uppföljning 4 veckor efter senaste mätning (SLU: bantning över mer än en månad, regelbunden hullbedömning) och varning vid nedgång över 1 % per vecka (branschpraxis, ej SLU).
- Med AI: sammanfattning, mönster med möjlig koppling till foderbyten, veterinärflagga och högst tre nästa steg. AI:n ger aldrig doser eller diagnoser.
- Demojournal för Sixten med tre anteckningar; den sista (ömma framhovar) ska ge veterinärflagga.

## AI testad mot facit (2026-10-14)

- Utläsning: 7 PDF:er och 3 mobilfoton gav alla värden inom 5 % av facit, inklusive omräkning från per kg vara. Enda avvikelsen (koppar i B06, 6,56 mot 7) beror på avrundning i facit. R00 avvisades korrekt som icke-analys. 3–9 s per rapport.
- Profilfyllning, förklaring och journalanalys fungerar i appen. Journalanalysen flaggar veterinär för Sixtens ömma hovar. Förklaringen begränsad till högst 120 ord i tre stycken.
- Kör om med `node scripts/utvardera-utlasning.mjs` efter ändringar i prompten eller modellen.
