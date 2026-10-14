# Fodr, hackathon-PoC

Ladda upp grovfoderanalysen, beskriv hästen, få en foderplan med produkter, gram per dag och kronor per månad. Målbild och scope finns i `malbild.md`.

## Köra

```bash
cd app
cp .env.example .env        # lägg in ANTHROPIC_API_KEY
npm install
npm run dev                 # http://localhost:5173
npm test                    # beräkningsmotorn mot handräknade SLU-fall
node scripts/importera-produkter.mjs   # bygger src/data/products.json från butiksdatan
node scripts/utvardera-utlasning.mjs   # AI-utläsning mot facit (kräver npm run dev och API-nyckel)
```

Utan API-nyckel fungerar allt utom AI-delarna (läsa uppladdad rapport, fylla profil från fritext, förklaring). Använd då "Exempel: komplett analys" i steg 2.

## Struktur

| Del | Var | Gör |
|---|---|---|
| SLU-modell | `app/src/domain/slu.ts` | Behov enligt SLU Rapport 289, varje värde med tabellhänvisning |
| Grovfoder | `app/src/domain/forage.ts`, `intake.ts` | Tillförsel, schablon när analysen saknar ett ämne |
| Urval | `app/src/domain/optimize.ts` | Billigaste kombination inom min- och maxgränser |
| Plan | `app/src/domain/plan.ts` | SLU:s justeringsordning, varningar, kväve |
| AI | `app/server/ai.ts` | Läser rapport, tolkar fritext, förklarar. Räknar aldrig |
| Produkter | `app/src/data/products.json` | Genererad från Granngården och Hööks (228 st), redigeras inte för hand |
| Produkturval | `app/scripts/produktval.json` | De 15 produkter urvalet får välja, med dos omräknad för hand och källa |
| Grovfoderkvalitet | `app/src/domain/kvalitet.ts` | SLU tabell 32, ts-intervall, jordinblandning |
| Känsligheter | `app/src/domain/kanslighet.ts` | Väljer bort produkter och ger råd utifrån hälsan |
| Journal | `app/src/domain/journal.ts` | Trend, uppföljning och sparade planer per häst; AI letar mönster |
| Testdata | `testdata/Testdata-from-other-dev/` | Syntetiska rapporter byggda på Växas statistik, med facit |

AI:n förstår, frågar och förklarar. Modellen räknar. Siffror i förklaringen kommer bara från beräkningen.

## Demomanus (cirka 3 minuter)

0. **Startsidan.** Boxkortet till vänster är det man får. Klicka "Testa med demokontot".
1. **Hästen.** Sixten i stallet till vänster. Visa profilens avsnitt och AI-rutan överst: skriv "en liter pellets morgon och kväll" och klicka "Fyll i profilen". Agenten frågar vad en liter väger.
2. **Analysen.** Fliken Analys. Dra in `testdata/Testdata-from-other-dev/krubba-testdata-v2/pdf/A01-medel-skord1.pdf` eller klicka och välj den. Visa att alla värden går att rätta. Reserv utan nät: "Använd en exempelanalys".
3. **Foderplanen.** Boxkortet: 8 kg hösilage morgon och kväll, Krafft Miner Original på morgonen, salt delat, pelletsen överstruken, 88 kr/mån mot 374 kr. Till höger "Därför": staplarna visar att allt täcks och att proteinet ligger på 169 %, fångvarningen och grovfoderflaggorna. Kryssa gärna i "Luftvägsbesvär" i profilen och visa att pulverprodukter väljs bort. "Skriv ut boxkortet" ger bara kortet.
4. **Journalen.** "Spara i journalen". Visa trenden (570 till 550 kg, hull 8 till 7) och klicka "Analysera journalen". AI:n kopplar den lösa magen till hösilagebytet och flaggar veterinär för de ömma framhovarna.

## Att göra före demo

- [ ] API-nyckel i `app/.env`, testa uppladdning av båda PDF:erna och fotot
- [ ] Granska doserna i `app/scripts/produktval.json` mot förpackningarna och kör importen igen
- [ ] Fyll i selen och E-vitamin för Trikem E+Selen och kalcium och fosfor för Granngårdens mineralfoder, så kan de ingå i urvalet
- [ ] Spela in backupvideo av demoflödet
