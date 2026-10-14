# Krubba – testdata v2 (förankrad i Sverigestatistik 2026)

Sju fiktiva analysrapporter vars värden är hämtade ur Växas riktiga foderstatistik för skördeår 2026, plus en referensrapport och facit.

## Innehåll

| Fil | Vad den testar |
|---|---|
| `pdf/A01-medel-skord1.pdf` | Rikssnittet för vanligaste fodret (blandvallsensilage, skörd 1). Hög proteinkvot, lågt selen. |
| `pdf/A02-sen-skord-fiberrik.pdf` | Sen skörd: lägre energi och protein, mer fiber. |
| `pdf/A03-tidig-skord-proteinrik.pdf` | Blött (30 % ts), energi- och proteinrikt. Hög Ca:P. |
| `pdf/B04-hoga-socker-ho.pdf` | Hö med socker 159 g/kg ts → EMS/fång-varning. **Värden per kg vara** – AI:n måste räkna om. |
| `pdf/A05-bas-utan-mineraler.pdf` | Billigaste paketet, mineraler saknas. |
| `pdf/B06-tredje-skord-hog-aska.pdf` | Hög aska och järn → jordinblandning. **Per kg vara.** |
| `pdf/A07-ho-lagt-protein.pdf` | Sent hö: proteinkvot under 5,5 och högt socker. |
| `pdf/R00-referens-sverigestatistik-2026.pdf` | Medel/P10/P90 för fem fodertyper, omräknat för häst, plus tolkningsriktlinjer. |
| `bilder/*.png` | Samma rapporter som bilder. |
| `bilder/*-mobilfoto.jpg` | Tre rapporter som sneda, skuggade "mobilfoton" (A01, B04, B06). |
| `data/facit.json` / `facit.csv` | Förväntade värden per kg ts och förväntade flaggor för varje analys. |
| `data/sverigestatistik-2026.json` | Fördelningarna i maskinläsbar form – för "ditt hösilage jämfört med Sverige". |
| `generate.py` | Skriptet som skapar allt. Lägg till scenarier i `SCEN`. |

Två labblayouter: Alfa (tabell, per kg ts) och Beta (rutor i två kolumner, per kg vara).

## Källor

- Växa, Foderanalyser för hela Sverige, skördeår 2026 (NorFor FAS), utdrag 2026-10-11: https://www.vxa.se/fakta/styrning-och-rutiner/mer-om-foder-och-bete/statistik-pa-foderanalyser/
- Tolkningsgränser: Eurofins, *Tolka din näringsanalys för häst* och *Näringsanalys av grovfoder till häst*.

## Viktiga förbehåll

- **OE häst och smb rp häst finns inte i Växas statistik** (den är byggd för nöt/NorFor). De är härledda med förenklade formler: OE ≈ OS-smältbarhet × (1 − aska) × 14,5 MJ, smb rp ≈ 0,87 × rp − 26. Rimliga för test, inte för riktig utfodring.
- Selen saknas i statistiken för hö och ren gräsvall, därför står det inte på de rapporterna.
- Parametrar på olika percentiler kombineras fritt (t.ex. P90 socker med medel protein), så varje rapport är realistisk per värde men inte nödvändigtvis ett verkligt prov.
- Allt är märkt TESTDATA. Labben är fiktiva.
