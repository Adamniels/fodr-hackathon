import type { ParseKeys } from 'i18next'
import type { DomainMessage } from '@fodr/domain/messages'
import { hittaRas } from '@fodr/domain/breeds'
import { doseGrams, kr, shortNutrientLabel, tal } from '../format'
import i18n from '.'

// Renders the engine's message codes (ADR 0014). Each code has its text at domain.<code> in the catalogue and a
// formatter here that turns its params into strings; the mapped type makes a missing formatter a compile error.

type Kod = DomainMessage['code']
type Params<C extends Kod> = Extract<DomainMessage, { code: C }>['params']
type Formatter<C extends Kod> = (params: Params<C>) => Record<string, string>

const sluNiva = (level: Params<'source.sodium'>['level']) => i18n.t(`domain.sluLevel.${level}`)

const tom = () => ({})

const tabell32Grupp = (group: Params<'quality.proteinHigh'>['group']) => i18n.t(`domain.table32Group.${group}`)

/** A list of messages or values as one phrase, comma separated as the engine joined them before (#12). */
const lista = (delar: string[]) => delar.join(', ')

/** Items in a sentence, the last joined by the catalogue's "and": "selen, järn och vitamin A" (#14). */
const andList = (delar: string[]) =>
  delar.length < 2
    ? lista(delar)
    : i18n.t('domain.list.and', { items: lista(delar.slice(0, -1)), last: delar[delar.length - 1] })

const FORMAT: { [C in Kod]: Formatter<C> } = {
  'swapReason.samePackCheaper': tom,
  'swapReason.sameEnergy': tom,
  'swapReason.coversNeedCheaper': (p) => ({ saving: kr(p.savingKr) }),
  'swapReason.coversBetter': tom,
  'action.removeConcentrate': (p) => ({ product: p.product, grams: doseGrams(p.grams) }),
  'action.swapCheaper': (p) => ({
    from: p.from,
    fromGrams: doseGrams(p.fromGrams),
    to: p.to,
    toGrams: doseGrams(p.toGrams),
    reason: domainText(p.reason),
    saving: kr(p.savingKr),
  }),
  'action.reduceRoughage': (p) => ({ fromKg: tal(p.fromKg, 1), toKg: tal(p.toKg, 1), minimumKg: tal(p.minimumKg, 1) }),
  'action.increaseRoughage': (p) => ({ fromKg: tal(p.fromKg, 1), toKg: tal(p.toKg, 1) }),
  'action.roughageLacksEnergy': tom,
  'action.proteinShort': tom,
  'action.continueSupplement': (p) => ({ product: p.product, grams: doseGrams(p.grams) }),
  'action.changeSupplement': (p) => ({
    product: p.product,
    fromGrams: doseGrams(p.fromGrams),
    toGrams: doseGrams(p.toGrams),
  }),
  'action.swapSupplement': (p) => ({
    from: p.from,
    fromGrams: doseGrams(p.fromGrams),
    to: p.to,
    toGrams: doseGrams(p.toGrams),
    reason: domainText(p.reason),
  }),
  'action.stopSupplement': (p) => ({ product: p.product, grams: doseGrams(p.grams), cost: kr(p.costKr) }),
  'action.giveSupplement': (p) => ({ product: p.product, grams: doseGrams(p.grams) }),
  'warning.roughageBelowMinimum': (p) => ({ kgDm: tal(p.kgDm, 1), minimumKgDm: tal(p.minimumKgDm, 1) }),
  'warning.metabolicVet': tom,
  'warning.sugarMissing': tom,
  'warning.sugarHigh': (p) => ({ sugarG: tal(p.sugarG, 1), limitG: tal(p.limitG, 0) }),
  'warning.ulcerPssmVet': tom,
  'note.incompleteDeclaration': (p) => ({ product: p.product }),
  'note.unknownFeed': (p) => ({ name: p.name }),
  // One decimal, like the requirement weight in the plan basis line on the same screen.
  'note.normalConditionWeight': (p) => ({ kg: tal(p.kg, 1) }),
  'note.workFromDiscipline': tom,
  'note.sweatSalt': tom,
  'note.coldSupplement': (p) => ({ mj: tal(p.mj, 1), degreesBelow: tal(p.degreesBelow, 1) }),
  'note.coldWorking': tom,
  'note.looseHousing': tom,
  'note.weightOutsideBreed': (p) => ({
    kg: tal(p.kg, 1),
    // Breed names are still Swedish data in the engine; they move to the catalogue with the rest of breeds.ts.
    breed: hittaRas(p.breedId)?.namn.toLowerCase() ?? p.breedId,
    minKg: tal(p.minKg, 0),
    maxKg: tal(p.maxKg, 0),
  }),
  'note.senior': tom,
  'source.energy': tom,
  'source.proteinPerMJ': tom,
  'source.macroMinerals': (p) => ({ level: sluNiva(p.level) }),
  'source.sodium': (p) => ({ level: sluNiva(p.level) }),
  'source.concentrateGuidelines': tom,
  'source.microMinerals': (p) => ({ level: sluNiva(p.level) }),
  'source.vitamins': tom,
  'source.table32': tom,
  'source.page20': tom,
  'source.page30': tom,
  'source.concentrateGuidelinesPage33': tom,
  'source.industryPracticePage34': tom,
  'source.eurofinsSoil': tom,
  'source.industryPractice': tom,
  'source.fodrRules': tom,
  'source.productDescriptions': tom,
  'qualityTitle.proteinHigh': tom,
  'qualityTitle.proteinLow': tom,
  'qualityTitle.energyHigh': tom,
  'qualityTitle.energyLow': tom,
  'qualityTitle.haylageWet': tom,
  'qualityTitle.haylageDry': tom,
  'qualityTitle.soil': tom,
  'qualityTitle.sugarHigh': tom,
  'qualityTitle.seleniumMissing': tom,
  // At most one decimal, as quality.ts formatted these before it returned codes.
  'quality.proteinHigh': (p) => ({
    ratio: tal(p.ratio, 1),
    min: tal(p.min, 1),
    max: tal(p.max, 1),
    group: tabell32Grupp(p.group),
  }),
  'quality.proteinLow': (p) => ({ ratio: tal(p.ratio, 1), min: tal(p.min, 1) }),
  'quality.energyHigh': (p) => ({
    mj: tal(p.mj, 1),
    min: tal(p.min, 1),
    max: tal(p.max, 1),
    group: tabell32Grupp(p.group),
  }),
  'quality.energyLow': (p) => ({ mj: tal(p.mj, 1), min: tal(p.min, 1), group: tabell32Grupp(p.group) }),
  'quality.haylageWet': (p) => ({ dmPercent: tal(p.dmPercent, 1) }),
  'quality.haylageDry': (p) => ({ dmPercent: tal(p.dmPercent, 1) }),
  'quality.soilAsh': (p) => ({ ashG: tal(p.ashG, 1) }),
  'quality.soilIron': (p) => ({ ironMg: tal(p.ironMg, 1) }),
  'quality.soilAshIron': (p) => ({ ashG: tal(p.ashG, 1), ironMg: tal(p.ironMg, 1) }),
  'quality.sugarHigh': (p) => ({ sugarG: tal(p.sugarG, 1) }),
  'quality.seleniumMissing': tom,
  'exclusion.sugarStarch': tom,
  'exclusion.grainOrStarch': tom,
  'exclusion.powder': tom,
  // Ingredients are stored identifiers, shown as they are (#12, decision 3).
  'exclusion.containsIngredient': (p) => ({ ingredient: p.ingredient }),
  'exclusion.proteinFeed': tom,
  'sensitivity.currentFeed': (p) => ({ product: p.product, reasons: lista(p.reasons.map(domainText)) }),
  'sensitivity.ulcer': (p) => ({ starchPerMealG: tal(p.starchPerMealG, 0) }),
  'sensitivity.pssm': tom,
  'sensitivity.airways': tom,
  'sensitivity.teeth': tom,
  'sensitivity.proteinExcess': (p) => ({ percent: tal(p.percent, 0) }),
  'sensitivity.avoidedIngredients': (p) => ({ ingredients: lista(p.ingredients) }),
  // Up to two decimals, like the weekly rate in the trend chip on the same screen (journal.trend.weightRate in
  // JournalStep).
  'trend.weightLossFast': (p) => ({ percentPerWeek: tal(p.percentPerWeek, 2) }),
  'trend.conditionRising': tom,
  'infeasible.roughageOverMax': (p) => ({ nutrients: andList(p.nutrients.map(shortNutrientLabel)) }),
  'infeasible.overMax': (p) => ({ nutrients: andList(p.nutrients.map(shortNutrientLabel)) }),
  'infeasible.caP': (p) => ({ minRatio: tal(p.minRatio, 1) }),
  // Limits are whole numbers; one decimal leaves them whole and keeps a future decimal limit (#13).
  'validation.range': (p) => ({ min: tal(p.min, 1), max: tal(p.max, 1) }),
  'validation.wholeRange': (p) => ({ min: tal(p.min, 0), max: tal(p.max, 0) }),
  'validation.atLeast': (p) => ({ min: tal(p.min, 1) }),
  'validation.positiveUpTo': (p) => ({ min: tal(p.min, 1), max: tal(p.max, 1) }),
  'validation.adultsOnly': (p) => ({ minAgeYears: tal(p.minAgeYears, 0) }),
  'validation.trotWithinRide': tom,
  'validation.date': tom,
}

/** Every code the engine can return. A unit test checks that each has a catalogue entry. */
export const DOMAIN_CODES = Object.keys(FORMAT) as Kod[]

// A code without a catalogue entry is a compile error here (and fails the unit test at run time).
type SaknadeNycklar = Exclude<`domain.${Kod}`, ParseKeys>
const allaNycklarFinns: [SaknadeNycklar] extends [never] ? true : SaknadeNycklar = true
void allaNycklarFinns

// The catalogue's typed t() checks each key's own placeholders, which a union of codes cannot satisfy.
// i18next substitutes placeholders one after another in the growing string, so a param value containing "{{x}}"
// would be filled by a later placeholder x. Params are product names from the product data and catalogue text
// today; strip "{{" from any user-entered value before it reaches a template with several placeholders.
const t = i18n.t as (key: string, params: Record<string, string>) => string

/** The text of an engine message in the active language. */
export function domainText(meddelande: DomainMessage): string {
  const format = FORMAT[meddelande.code] as (params: DomainMessage['params']) => Record<string, string>
  return t(`domain.${meddelande.code}`, format(meddelande.params))
}
