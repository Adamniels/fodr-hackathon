import { describe, expect, it } from 'vitest'
import type { DomainMessage } from '@fodr/domain/messages'
import i18n from '.'
import { DOMAIN_CODES, domainText } from './domain'

// Each code renders its exact sentence. Numbers are formatted for sv-SE (#86): a decimal comma, and U+00A0, the
// no-break space sv-SE puts between thousands and before "kr".
const FALL: [DomainMessage, string][] = [
  [
    { code: 'action.removeConcentrate', params: { product: 'Krafft Leisure Pellets 20kg', grams: 1000 } },
    'Ta bort Krafft Leisure Pellets 20kg (1\u00a0000 g/dag). Grovfodret täcker energibehovet ändå.',
  ],
  [
    {
      code: 'action.swapCheaper',
      params: {
        from: 'Krafft Senior Pellets 20kg',
        fromGrams: 800,
        to: 'Krafft Low Starch Pellets 20kg',
        toGrams: 790,
        reason: { code: 'swapReason.sameEnergy', params: {} },
        savingKr: 1287.6,
      },
    },
    'Byt Krafft Senior Pellets 20kg (800 g) mot 790 g Krafft Low Starch Pellets 20kg: samma energi, liknande protein, inte mer stärkelse, 1\u00a0288\u00a0kr billigare i månaden.',
  ],
  [
    { code: 'action.reduceRoughage', params: { fromKg: 30, toKg: 16.04, minimumKg: 12.746 } },
    'Minska grovfodret från 30 till 16 kg/dag. Lägre än 12,7 kg/dag rekommenderas inte.',
  ],
  [{ code: 'action.increaseRoughage', params: { fromKg: 3, toKg: 8.55 } }, 'Öka grovfodret från 3 till 8,6 kg/dag.'],
  [
    { code: 'action.roughageLacksEnergy', params: {} },
    'Grovfodret räcker inte för energibehovet. Ett energirikare vallfoder eller ett kraftfoder behövs.',
  ],
  [
    { code: 'action.proteinShort', params: {} },
    'Proteinet räcker inte. Ett proteinrikare vallfoder eller ett proteinfoder behövs.',
  ],
  [
    { code: 'action.continueSupplement', params: { product: 'Salt 1,5 kg', grams: 14 } },
    'Fortsätt med 14 g/dag Salt 1,5 kg.',
  ],
  [
    { code: 'action.changeSupplement', params: { product: 'Salt 1,5 kg', fromGrams: 21, toGrams: 14 } },
    'Ändra Salt 1,5 kg från 21 till 14 g/dag.',
  ],
  [
    {
      code: 'action.swapSupplement',
      params: {
        from: 'Pellets 15 kg Mineral Röd',
        fromGrams: 100,
        to: 'Krafft Miner Original Pellets 20kg',
        toGrams: 66,
        reason: { code: 'swapReason.coversNeedCheaper', params: { savingKr: 12.4 } },
      },
    },
    'Byt Pellets 15 kg Mineral Röd (100 g) mot 66 g Krafft Miner Original Pellets 20kg: täcker behovet, 12\u00a0kr billigare i månaden.',
  ],
  [
    {
      code: 'action.swapSupplement',
      params: {
        from: 'Pellets 15 kg Mineral Röd',
        fromGrams: 100,
        to: 'Krafft Miner VitaMinerals Pellets 20kg',
        toGrams: 84,
        reason: { code: 'swapReason.coversBetter', params: {} },
      },
    },
    'Byt Pellets 15 kg Mineral Röd (100 g) mot 84 g Krafft Miner VitaMinerals Pellets 20kg: täcker det som saknas bättre med ditt grovfoder.',
  ],
  [
    { code: 'action.stopSupplement', params: { product: 'Selo-E 900g', grams: 1500, costKr: 2045.5 } },
    'Sluta med Selo-E 900g (1\u00a0500 g/dag, 2\u00a0046\u00a0kr i månaden). Behovet täcks utan den.',
  ],
  [
    { code: 'action.giveSupplement', params: { product: 'Krafft Miner Original Pellets 20kg', grams: 66 } },
    'Ge 66 g/dag Krafft Miner Original Pellets 20kg.',
  ],
  [
    { code: 'action.giveSupplement', params: { product: 'Eclipse Biofarmab Linfröolja 1L', grams: 2500 } },
    'Ge 2\u00a0500 g/dag Eclipse Biofarmab Linfröolja 1L.',
  ],
  // Grams typed with a decimal round to whole grams, as in the shopping list.
  [
    { code: 'action.continueSupplement', params: { product: 'Salt 1,5 kg', grams: 12.5 } },
    'Fortsätt med 13 g/dag Salt 1,5 kg.',
  ],
  [
    { code: 'action.changeSupplement', params: { product: 'Salt 1,5 kg', fromGrams: 12.4, toGrams: 1250 } },
    'Ändra Salt 1,5 kg från 12 till 1\u00a0250 g/dag.',
  ],
  [{ code: 'swapReason.samePackCheaper', params: {} }, 'samma foder i billigare förpackning'],
  [{ code: 'swapReason.sameEnergy', params: {} }, 'samma energi, liknande protein, inte mer stärkelse'],
  [
    { code: 'swapReason.coversNeedCheaper', params: { savingKr: 12.4 } },
    'täcker behovet, 12\u00a0kr billigare i månaden',
  ],
  [{ code: 'swapReason.coversBetter', params: {} }, 'täcker det som saknas bättre med ditt grovfoder'],
  [
    { code: 'warning.roughageBelowMinimum', params: { kgDm: 4.56, minimumKgDm: 5.06 } },
    'Grovfodergivan (4,6 kg ts) är under SLU:s minimum på 5,1 kg ts per dag.',
  ],
  [
    { code: 'warning.metabolicVet', params: {} },
    'Hästen har haft fång, har EMS eller PPID. Stäm av foderstaten med veterinär.',
  ],
  [
    { code: 'warning.sugarMissing', params: {} },
    'Analysen saknar socker. Vid fång eller EMS bör sockerhalten i grovfodret vara känd.',
  ],
  [
    { code: 'warning.sugarHigh', params: { sugarG: 122.25, limitG: 100 } },
    'Grovfodret har 122,3 g socker per kg ts, över ungefär 100 g som brukar rekommenderas vid fång. Blötläggning sänker sockerhalten.',
  ],
  [
    { code: 'warning.ulcerPssmVet', params: {} },
    'Magsår och korsförlamning kräver veterinärens bedömning. Planen anpassar fodret men ersätter inte behandling.',
  ],
  [
    { code: 'note.incompleteDeclaration', params: { product: 'Hästfoder Krafft Leisure Pellets 20kg' } },
    'Hästfoder Krafft Leisure Pellets 20kg har ofullständig näringsdeklaration. Ämnen som inte anges räknas som noll.',
  ],
  [
    { code: 'note.unknownFeed', params: { name: 'Hemblandning' } },
    '"Hemblandning" finns inte i produktdatabasen och räknas inte med.',
  ],
  [
    { code: 'note.normalConditionWeight', params: { kg: 1012.4 } },
    'Behoven räknas på 1\u00a0012,4 kg, ungefärlig vikt vid normalt hull (SLU tabell 3).',
  ],
  [
    { code: 'note.workFromDiscipline', params: {} },
    'Arbetstillägget följer grenen och nivån, som ger mer än de angivna ridpassen (SLU tabell 9–11).',
  ],
  [
    { code: 'note.sweatSalt', params: {} },
    'Hästar som svettas mycket förlorar salt: 8–35 g koksalt per 100 kg på arbetsdagar beroende på arbete och väder (SLU tabell 16). Ge extra salt eller elektrolyter de dagarna.',
  ],
  [
    { code: 'note.coldSupplement', params: { mj: 4.6181, degreesBelow: 5.5 } },
    'Kylatillägg 4,6 MJ: 5,5 grader under −15 °C, ute utan täcke (SLU sid 15).',
  ],
  // −20,3 °C gives −15 − (−20,3) = 5.300000000000001, which used to render as is.
  [
    { code: 'note.coldSupplement', params: { mj: 6.12, degreesBelow: -15 - -20.3 } },
    'Kylatillägg 6,1 MJ: 5,3 grader under −15 °C, ute utan täcke (SLU sid 15).',
  ],
  [
    { code: 'note.coldSupplement', params: { mj: 12, degreesBelow: 10 } },
    'Kylatillägg 12 MJ: 10 grader under −15 °C, ute utan täcke (SLU sid 15).',
  ],
  [
    { code: 'note.coldWorking', params: {} },
    'Kallt väder: arbetande hästar får inget beräknat kylatillägg. Följ hullet (SLU).',
  ],
  [
    { code: 'note.looseHousing', params: {} },
    'Lösdrift och mycket hagvistelse kan öka energibehovet. SLU anger ingen siffra, följ hullet.',
  ],
  [
    { code: 'note.weightOutsideBreed', params: { kg: 545.5, breedId: 'islandshast', minKg: 280, maxKg: 400 } },
    '545,5 kg ligger utanför det vanliga intervallet för islandshäst (280–400 kg, SLU tabell 33). Kontrollera vikten.',
  ],
  [
    { code: 'note.senior', params: {} },
    'Äldre häst: energibehovet kan öka runt 20 års ålder. Följ hullet regelbundet (SLU).',
  ],
  [{ code: 'source.energy', params: {} }, 'SLU tabell 3, 9–11 och kyla'],
  [{ code: 'source.proteinPerMJ', params: {} }, 'SLU: 6 g smb rp/MJ'],
  [{ code: 'source.macroMinerals', params: { level: 'arbeteUnder30' } }, 'SLU tabell 15, arbete <30 %'],
  [{ code: 'source.macroMinerals', params: { level: 'underhall' } }, 'SLU tabell 15, underhåll'],
  [{ code: 'source.sodium', params: { level: 'arbete75to130' } }, 'SLU tabell 15 (NaCl), arbete 75–130 %'],
  [{ code: 'source.concentrateGuidelines', params: {} }, 'SLU riktlinjer kraftfoder'],
  [{ code: 'source.microMinerals', params: { level: 'arbete' } }, 'SLU tabell 17, arbete'],
  [{ code: 'source.vitamins', params: {} }, 'SLU tabell 18'],
  // Input validation (#13). The age sentence is the one the engine used to throw.
  [
    { code: 'validation.adultsOnly', params: { minAgeYears: 3 } },
    'Modellen gäller vuxna hästar (3 år och äldre). Unghästar ingår inte i prototypen.',
  ],
  [{ code: 'validation.range', params: { min: 50, max: 1200 } }, 'Ange ett värde mellan 50 och 1\u00a0200.'],
  [{ code: 'validation.range', params: { min: -50, max: 40 } }, 'Ange ett värde mellan \u221250 och 40.'],
  [{ code: 'validation.wholeRange', params: { min: 1, max: 9 } }, 'Ange ett heltal mellan 1 och 9.'],
  [{ code: 'validation.atLeast', params: { min: 0 } }, 'Värdet kan inte vara lägre än 0.'],
  [{ code: 'validation.positiveUpTo', params: { min: 0, max: 40 } }, 'Ange ett värde över 0 och högst 40.'],
  [{ code: 'validation.trotWithinRide', params: {} }, 'Kan inte vara fler än minuterna per pass.'],
  // Roughage quality (#12). Numbers keep at most one decimal, as quality.ts formatted them before.
  [{ code: 'qualityTitle.proteinHigh', params: {} }, 'Mer protein än hästen behöver'],
  [{ code: 'qualityTitle.proteinLow', params: {} }, 'Proteinfattigt grovfoder'],
  [{ code: 'qualityTitle.energyHigh', params: {} }, 'Energirikt grovfoder'],
  [{ code: 'qualityTitle.energyLow', params: {} }, 'Energifattigt grovfoder'],
  [{ code: 'qualityTitle.haylageWet', params: {} }, 'Blött hösilage'],
  [{ code: 'qualityTitle.haylageDry', params: {} }, 'Torrt hösilage'],
  [{ code: 'qualityTitle.soil', params: {} }, 'Möjlig jordinblandning'],
  [{ code: 'qualityTitle.sugarHigh', params: {} }, 'Högt socker'],
  [{ code: 'qualityTitle.seleniumMissing', params: {} }, 'Selen ej analyserat'],
  [
    { code: 'quality.proteinHigh', params: { ratio: 104 / 10.2, min: 5, max: 6, group: 'ovriga' } },
    '10,2 g smältbart protein per MJ, över 5–6 som SLU rekommenderar för hästar utan hårt arbete. Överskottet blir kväve i gödseln. Passar bättre till unghästar och fölston.',
  ],
  [
    { code: 'quality.proteinHigh', params: { ratio: 7.25, min: 5, max: 7, group: 'hart' } },
    '7,3 g smältbart protein per MJ, över 5–7 som SLU rekommenderar för hästar i hårt arbete. Överskottet blir kväve i gödseln. Passar bättre till unghästar och fölston.',
  ],
  [
    { code: 'quality.proteinLow', params: { ratio: 22 / 5.5, min: 5 } },
    '4 g smältbart protein per MJ, under 5 som SLU rekommenderar. Proteinet kan behöva kompletteras.',
  ],
  [
    { code: 'quality.energyHigh', params: { mj: 10.2, min: 6.5, max: 8, group: 'ovriga' } },
    '10,2 MJ per kg ts, över 6,5–8 som SLU rekommenderar för hästar utan hårt arbete. Fri tillgång kan ge överhull. Att blanda in halm eller välja en senare skörd sänker energin.',
  ],
  [
    { code: 'quality.energyLow', params: { mj: 5.5, min: 6.5, group: 'ovriga' } },
    '5,5 MJ per kg ts, under 6,5 som SLU rekommenderar för hästar utan hårt arbete.',
  ],
  [
    { code: 'quality.energyLow', params: { mj: 8.75, min: 9, group: 'hart' } },
    '8,8 MJ per kg ts, under 9 som SLU rekommenderar för hästar i hårt arbete.',
  ],
  [
    { code: 'quality.haylageWet', params: { dmPercent: 39.7 } },
    'Torrsubstans 39,7 %, under 45–65 % som SLU rekommenderar för inplastat vallfoder till häst. Större risk för feljäsning och klostridier, och hästen behöver äta mycket vara. Kort hållbarhet efter öppning.',
  ],
  [
    { code: 'quality.haylageDry', params: { dmPercent: 70 } },
    'Torrsubstans 70 %, över 65 %. SLU anger förhöjd risk för mögel i inplastat vallfoder över 65–70 % ts.',
  ],
  [
    { code: 'quality.soilAsh', params: { ashG: 120 } },
    'Högt innehåll (aska 120 g per kg ts) tyder på jord i fodret, vilket ökar risken för dålig hygienisk kvalitet.',
  ],
  [
    { code: 'quality.soilIron', params: { ironMg: 1320.25 } },
    'Högt innehåll (järn 1\u00a0320,3 mg per kg ts) tyder på jord i fodret, vilket ökar risken för dålig hygienisk kvalitet.',
  ],
  [
    { code: 'quality.soilAshIron', params: { ashG: 95.5, ironMg: 260 } },
    'Högt innehåll (aska 95,5 g och järn 260 mg per kg ts) tyder på jord i fodret, vilket ökar risken för dålig hygienisk kvalitet.',
  ],
  [
    { code: 'quality.sugarHigh', params: { sugarG: 150 } },
    '150 g socker per kg ts. Olämpligt utan åtgärd, till exempel blötläggning, för hästar med fång eller EMS.',
  ],
  [
    { code: 'quality.seleniumMissing', params: {} },
    'Svenska jordar är selenfattiga och tillskott behövs i de allra flesta fall. Planen räknar med ett lågt typvärde.',
  ],
  [{ code: 'source.table32', params: {} }, 'SLU tabell 32'],
  [{ code: 'source.page30', params: {} }, 'SLU sid 30'],
  [{ code: 'source.page20', params: {} }, 'SLU sid 20'],
  [{ code: 'source.eurofinsSoil', params: {} }, 'Eurofins tolkningsstöd (ej SLU)'],
  [{ code: 'source.industryPractice', params: {} }, 'Branschpraxis (ej SLU)'],
  [{ code: 'source.industryPracticePage34', params: {} }, 'Branschpraxis, SLU sid 34 (mun- och tandstatus)'],
  [{ code: 'source.concentrateGuidelinesPage33', params: {} }, 'SLU riktlinjer för kraftfoder, sid 33'],
  [{ code: 'source.fodrRules', params: {} }, 'Fodrs känslighetsregler'],
  [{ code: 'source.productDescriptions', params: {} }, 'Härlett ur produktbeskrivningar'],
  // Why a product does not suit the horse (#12).
  [{ code: 'exclusion.sugarStarch', params: {} }, 'för mycket eller okänt socker och stärkelse'],
  [{ code: 'exclusion.grainOrStarch', params: {} }, 'spannmål eller mycket stärkelse, olämpligt vid magsår'],
  [{ code: 'exclusion.powder', params: {} }, 'pulverform kan damma'],
  [{ code: 'exclusion.containsIngredient', params: { ingredient: 'lusern' } }, 'innehåller lusern'],
  [{ code: 'exclusion.proteinFeed', params: {} }, 'proteinfoder'],
  // Advice from the horse's sensitivities (#12).
  [
    {
      code: 'sensitivity.currentFeed',
      params: {
        product: 'Hästfoder Krafft Leisure Pellets 20kg',
        reasons: [{ code: 'exclusion.sugarStarch', params: {} }],
      },
    },
    'Hästfoder Krafft Leisure Pellets 20kg, som hästen får i dag: för mycket eller okänt socker och stärkelse. Överväg att byta.',
  ],
  [
    {
      code: 'sensitivity.currentFeed',
      params: {
        product: 'Havre hel 18kg',
        reasons: [
          { code: 'exclusion.grainOrStarch', params: {} },
          { code: 'exclusion.containsIngredient', params: { ingredient: 'spannmål' } },
        ],
      },
    },
    'Havre hel 18kg, som hästen får i dag: spannmål eller mycket stärkelse, olämpligt vid magsår, innehåller spannmål. Överväg att byta.',
  ],
  [
    { code: 'sensitivity.ulcer', params: { starchPerMealG: 750 } },
    'Magsår: ge grovfoder före kraftfoder och dela upp fodret på flera mål. SLU:s tak är 750 g stärkelse per mål för den här hästen; vid magsår bör det ligga klart under.',
  ],
  // Grouped for the locale (#97): a horse over 667 kg gets four digits.
  [
    { code: 'sensitivity.ulcer', params: { starchPerMealG: 1050 } },
    'Magsår: ge grovfoder före kraftfoder och dela upp fodret på flera mål. SLU:s tak är 1\u00a0050 g stärkelse per mål för den här hästen; vid magsår bör det ligga klart under.',
  ],
  [
    { code: 'sensitivity.pssm', params: {} },
    'Korsförlamning: håll socker och stärkelse låga och använd fett som energikälla om hästen behöver mer energi. Selen och vitamin E är viktiga, och planen täcker dem.',
  ],
  [
    { code: 'sensitivity.airways', params: {} },
    'Luftvägar: blötlägg eller ånga höet, eller välj hösilage, och undvik dammigt foder och strö. Mögligt och dammigt hö är en vanlig orsak till luftvägsbesvär.',
  ],
  [
    { code: 'sensitivity.teeth', params: {} },
    'Tandproblem: blötlägg pellets till mash. Om hästen inte kan tugga långstrå, ersätt en del av grovfodret med hackat grovfoder eller grovfoderpellets. Låt tandläkare kontrollera munnen.',
  ],
  [
    { code: 'sensitivity.proteinExcess', params: { percent: 69 } },
    'Hästen får 69 % mer protein än den behöver. Vid proteinkänslighet: välj ett grovfoder med lägre proteinhalt eller blanda in halm.',
  ],
  [
    { code: 'sensitivity.proteinExcess', params: { percent: 1250 } },
    'Hästen får 1\u00a0250 % mer protein än den behöver. Vid proteinkänslighet: välj ett grovfoder med lägre proteinhalt eller blanda in halm.',
  ],
  [
    { code: 'sensitivity.avoidedIngredients', params: { ingredients: ['spannmål', 'melass'] } },
    'Produkter med spannmål, melass är bortvalda. Ingredienserna är tolkade ur butikernas beskrivningar, så kontrollera förpackningen.',
  ],
  // Journal trend. The weekly loss has up to two decimals, like the trend chip on the same screen (#97).
  [
    { code: 'trend.weightLossFast', params: { percentPerWeek: 1.2346 } },
    'Vikten minskar 1,23 % per vecka. Snabbare än ungefär 1 % per vecka ökar risken för ämnesomsättningsproblem; SLU rekommenderar att bantning sker över mer än en månad.',
  ],
  [
    { code: 'trend.weightLossFast', params: { percentPerWeek: 1.2 } },
    'Vikten minskar 1,2 % per vecka. Snabbare än ungefär 1 % per vecka ökar risken för ämnesomsättningsproblem; SLU rekommenderar att bantning sker över mer än en månad.',
  ],
  [
    { code: 'trend.weightLossFast', params: { percentPerWeek: 2 } },
    'Vikten minskar 2 % per vecka. Snabbare än ungefär 1 % per vecka ökar risken för ämnesomsättningsproblem; SLU rekommenderar att bantning sker över mer än en månad.',
  ],
  [
    { code: 'trend.weightLossFast', params: { percentPerWeek: 4.55 } },
    'Vikten minskar 4,55 % per vecka. Snabbare än ungefär 1 % per vecka ökar risken för ämnesomsättningsproblem; SLU rekommenderar att bantning sker över mer än en månad.',
  ],
  [
    { code: 'trend.conditionRising', params: {} },
    'Hullet ökar trots att hästen redan var i överhull. Se över energin i foderstaten.',
  ],
]

describe('domainText', () => {
  it('has a catalogue entry for every code', () => {
    expect(DOMAIN_CODES.filter((code) => !i18n.exists(`domain.${code}`))).toEqual([])
  })

  it('has a golden sentence for every code', () => {
    const tested = new Set(FALL.map(([m]) => m.code))
    expect(DOMAIN_CODES.filter((code) => !tested.has(code))).toEqual([])
  })

  it.each(FALL)('renders %j', (meddelande, text) => {
    expect(domainText(meddelande)).toBe(text)
  })
})
