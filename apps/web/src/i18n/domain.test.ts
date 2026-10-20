import { describe, expect, it } from 'vitest'
import type { DomanMeddelande } from '@fodr/domain/meddelanden'
import i18n from '.'
import { DOMAIN_CODES, domainText } from './domain'

// Each code renders its exact sentence. Numbers are formatted for sv-SE (#86): a decimal comma, and U+00A0, the
// no-break space sv-SE puts between thousands and before "kr".
const FALL: [DomanMeddelande, string][] = [
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
    'Behoven räknas på 1\u00a0012 kg, ungefärlig vikt vid normalt hull (SLU tabell 3).',
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
  [
    { code: 'error.adultsOnly', params: { minAgeYears: 3 } },
    'Modellen gäller vuxna hästar (3 år och äldre). Unghästar ingår inte i prototypen.',
  ],
]

describe('domainText', () => {
  it('has a catalogue entry for every code', () => {
    expect(DOMAIN_CODES.filter((code) => !i18n.exists(`domain.${code}`))).toEqual([])
  })

  it.each(FALL)('renders %j', (meddelande, text) => {
    expect(domainText(meddelande)).toBe(text)
  })
})
