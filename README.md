# Krubba, hackathon-PoC

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

## Demomanus (cirka 2 minuter)

0. **Inloggning.** Visa startsidan och klicka "Testa med demokontot".
1. **Hästen.** Visa Sixten (12 år, halvblod, 550 kg, hull 7, rids 4 dagar, fång för två år sedan, 1 kg pellets). Visa AI-rutan: skriv "en liter pellets morgon och kväll" och visa att fälten fylls i. Agenten frågar vad en liter väger i stället för att gissa (testat 2026-10-14).
2. **Analysen.** Ladda upp `testdata/Testdata-from-other-dev/krubba-testdata-v2/pdf/A01-medel-skord1.pdf` (rikssnittet för hösilage). Visa att alla värden syns och går att rätta.
3. **Planen.** Grovfodret är proteinrikt, energirikt och blött (SLU tabell 32 och sid 30). I dag 15 % för mycket energi och för lite natrium och selen. Ta bort pelletsen (olämpliga vid fång, visas under "Anpassat efter Sixtens hälsa"), 66 g Krafft Miner Original och 14 g salt, 88 kr/mån mot 374 kr i dag. Fångvarning och veterinärhänvisning. Kryssa gärna i "Luftvägsbesvär" live och visa att pulverprodukter väljs bort. 16 kg kväve per år i onödan.
4. **Förtroende.** Scrolla till tabellen: behov, tillförsel, maxgräns och källa på varje rad.
5. **Journalen.** Klicka "Spara planen i journalen". Visa trenden (570 till 550 kg, hull 8 till 7, under 1 % per vecka) och klicka "Analysera journalen". AI:n bör koppla den lösa magen till hösilagebytet och flagga veterinär för de ömma framhovarna, med tanke på fånghistoriken. Testat 2026-10-14: fungerar.

Backup om nätet krånglar: "Exempel: komplett analys" ger samma plan utan AI-anrop.

## Att göra före demo

- [ ] API-nyckel i `app/.env`, testa uppladdning av båda PDF:erna och fotot
- [ ] Granska doserna i `app/scripts/produktval.json` mot förpackningarna och kör importen igen
- [ ] Fyll i selen och E-vitamin för Trikem E+Selen och kalcium och fosfor för Granngårdens mineralfoder, så kan de ingå i urvalet
- [ ] Spela in backupvideo av demoflödet
