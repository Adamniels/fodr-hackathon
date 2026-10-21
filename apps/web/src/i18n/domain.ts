import type { ParseKeys } from 'i18next'
import type { DomainMessage } from '@fodr/domain/messages'
import { hittaRas } from '@fodr/domain/breeds'
import { doseGrams, formatMoney, shortNutrientLabel, formatNumber } from '../format'
import i18n from '.'

// Renders the engine's message codes (ADR 0014). Each code has its text at domain.<code> in the catalogue and a
// formatter here that turns its params into strings; the mapped type makes a missing formatter a compile error.

type Code = DomainMessage['code']
type Params<C extends Code> = Extract<DomainMessage, { code: C }>['params']
type Formatter<C extends Code> = (params: Params<C>) => Record<string, string>

const sluLevel = (level: Params<'source.sodium'>['level']) => i18n.t(`domain.sluLevel.${level}`)

const noParams = () => ({})

const table32Group = (group: Params<'quality.proteinHigh'>['group']) => i18n.t(`domain.table32Group.${group}`)

/** A list of messages or values as one phrase, comma separated as the engine joined them before (#12). */
const commaList = (delar: string[]) => delar.join(', ')

/** Items in a sentence, the last joined by the catalogue's "and": "selen, järn och vitamin A" (#14). */
const andList = (delar: string[]) =>
  delar.length < 2
    ? commaList(delar)
    : i18n.t('domain.list.and', { items: commaList(delar.slice(0, -1)), last: delar[delar.length - 1] })

const FORMAT: { [C in Code]: Formatter<C> } = {
  'swapReason.samePackCheaper': noParams,
  'swapReason.sameEnergy': noParams,
  'swapReason.coversNeedCheaper': (p) => ({ saving: formatMoney(p.savingKr) }),
  'swapReason.coversBetter': noParams,
  'action.removeConcentrate': (p) => ({ product: p.product, grams: doseGrams(p.grams) }),
  'action.swapCheaper': (p) => ({
    from: p.from,
    fromGrams: doseGrams(p.fromGrams),
    to: p.to,
    toGrams: doseGrams(p.toGrams),
    reason: domainText(p.reason),
    saving: formatMoney(p.savingKr),
  }),
  'action.reduceRoughage': (p) => ({
    fromKg: formatNumber(p.fromKg, 1),
    toKg: formatNumber(p.toKg, 1),
    minimumKg: formatNumber(p.minimumKg, 1),
  }),
  'action.increaseRoughage': (p) => ({ fromKg: formatNumber(p.fromKg, 1), toKg: formatNumber(p.toKg, 1) }),
  'action.roughageLacksEnergy': noParams,
  'action.proteinShort': noParams,
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
  'action.stopSupplement': (p) => ({ product: p.product, grams: doseGrams(p.grams), cost: formatMoney(p.costKr) }),
  'action.giveSupplement': (p) => ({ product: p.product, grams: doseGrams(p.grams) }),
  'warning.roughageBelowMinimum': (p) => ({
    kgDm: formatNumber(p.kgDm, 1),
    minimumKgDm: formatNumber(p.minimumKgDm, 1),
  }),
  'warning.metabolicVet': noParams,
  'warning.sugarMissing': noParams,
  'warning.sugarHigh': (p) => ({ sugarG: formatNumber(p.sugarG, 1), limitG: formatNumber(p.limitG, 0) }),
  'warning.ulcerPssmVet': noParams,
  'note.incompleteDeclaration': (p) => ({ product: p.product }),
  'note.unknownFeed': (p) => ({ name: p.name }),
  // One decimal, like the requirement weight in the plan basis line on the same screen.
  'note.normalConditionWeight': (p) => ({ kg: formatNumber(p.kg, 1) }),
  'note.workFromDiscipline': noParams,
  'note.sweatSalt': noParams,
  'note.coldSupplement': (p) => ({ mj: formatNumber(p.mj, 1), degreesBelow: formatNumber(p.degreesBelow, 1) }),
  'note.coldWorking': noParams,
  'note.looseHousing': noParams,
  'note.weightOutsideBreed': (p) => ({
    kg: formatNumber(p.kg, 1),
    // Breed names are still Swedish data in the engine; they move to the catalogue with the rest of breeds.ts.
    breed: hittaRas(p.breedId)?.namn.toLowerCase() ?? p.breedId,
    minKg: formatNumber(p.minKg, 0),
    maxKg: formatNumber(p.maxKg, 0),
  }),
  'note.senior': noParams,
  'source.energy': noParams,
  'source.proteinPerMJ': noParams,
  'source.macroMinerals': (p) => ({ level: sluLevel(p.level) }),
  'source.sodium': (p) => ({ level: sluLevel(p.level) }),
  'source.concentrateGuidelines': noParams,
  'source.microMinerals': (p) => ({ level: sluLevel(p.level) }),
  'source.vitamins': noParams,
  'source.table32': noParams,
  'source.page20': noParams,
  'source.page30': noParams,
  'source.concentrateGuidelinesPage33': noParams,
  'source.industryPracticePage34': noParams,
  'source.eurofinsSoil': noParams,
  'source.industryPractice': noParams,
  'source.fodrRules': noParams,
  'source.productDescriptions': noParams,
  'qualityTitle.proteinHigh': noParams,
  'qualityTitle.proteinLow': noParams,
  'qualityTitle.energyHigh': noParams,
  'qualityTitle.energyLow': noParams,
  'qualityTitle.haylageWet': noParams,
  'qualityTitle.haylageDry': noParams,
  'qualityTitle.soil': noParams,
  'qualityTitle.sugarHigh': noParams,
  'qualityTitle.seleniumMissing': noParams,
  // At most one decimal, as quality.ts formatted these before it returned codes.
  'quality.proteinHigh': (p) => ({
    ratio: formatNumber(p.ratio, 1),
    min: formatNumber(p.min, 1),
    max: formatNumber(p.max, 1),
    group: table32Group(p.group),
  }),
  'quality.proteinLow': (p) => ({ ratio: formatNumber(p.ratio, 1), min: formatNumber(p.min, 1) }),
  'quality.energyHigh': (p) => ({
    mj: formatNumber(p.mj, 1),
    min: formatNumber(p.min, 1),
    max: formatNumber(p.max, 1),
    group: table32Group(p.group),
  }),
  'quality.energyLow': (p) => ({
    mj: formatNumber(p.mj, 1),
    min: formatNumber(p.min, 1),
    group: table32Group(p.group),
  }),
  'quality.haylageWet': (p) => ({ dmPercent: formatNumber(p.dmPercent, 1) }),
  'quality.haylageDry': (p) => ({ dmPercent: formatNumber(p.dmPercent, 1) }),
  'quality.soilAsh': (p) => ({ ashG: formatNumber(p.ashG, 1) }),
  'quality.soilIron': (p) => ({ ironMg: formatNumber(p.ironMg, 1) }),
  'quality.soilAshIron': (p) => ({ ashG: formatNumber(p.ashG, 1), ironMg: formatNumber(p.ironMg, 1) }),
  'quality.sugarHigh': (p) => ({ sugarG: formatNumber(p.sugarG, 1) }),
  'quality.seleniumMissing': noParams,
  'exclusion.sugarStarch': noParams,
  'exclusion.grainOrStarch': noParams,
  'exclusion.powder': noParams,
  // Ingredients are stored identifiers, shown as they are (#12, decision 3).
  'exclusion.containsIngredient': (p) => ({ ingredient: p.ingredient }),
  'exclusion.proteinFeed': noParams,
  'sensitivity.currentFeed': (p) => ({ product: p.product, reasons: commaList(p.reasons.map(domainText)) }),
  'sensitivity.ulcer': (p) => ({ starchPerMealG: formatNumber(p.starchPerMealG, 0) }),
  'sensitivity.pssm': noParams,
  'sensitivity.airways': noParams,
  'sensitivity.teeth': noParams,
  'sensitivity.proteinExcess': (p) => ({ percent: formatNumber(p.percent, 0) }),
  'sensitivity.avoidedIngredients': (p) => ({ ingredients: commaList(p.ingredients) }),
  // Up to two decimals, like the weekly rate in the trend chip on the same screen (journal.trend.weightRate in
  // JournalStep).
  'trend.weightLossFast': (p) => ({ percentPerWeek: formatNumber(p.percentPerWeek, 2) }),
  'trend.conditionRising': noParams,
  'infeasible.roughageOverMax': (p) => ({ nutrients: andList(p.nutrients.map(shortNutrientLabel)) }),
  'infeasible.overMax': (p) => ({ nutrients: andList(p.nutrients.map(shortNutrientLabel)) }),
  'infeasible.caP': (p) => ({ minRatio: formatNumber(p.minRatio, 1) }),
  // Limits are whole numbers; one decimal leaves them whole and keeps a future decimal limit (#13).
  'validation.range': (p) => ({ min: formatNumber(p.min, 1), max: formatNumber(p.max, 1) }),
  'validation.wholeRange': (p) => ({ min: formatNumber(p.min, 0), max: formatNumber(p.max, 0) }),
  'validation.atLeast': (p) => ({ min: formatNumber(p.min, 1) }),
  'validation.positiveUpTo': (p) => ({ min: formatNumber(p.min, 1), max: formatNumber(p.max, 1) }),
  'validation.adultsOnly': (p) => ({ minAgeYears: formatNumber(p.minAgeYears, 0) }),
  'validation.trotWithinRide': noParams,
  'validation.date': noParams,
  'analysis.notAnAnalysis': noParams,
  'analysis.missingDryMatter': noParams,
  // The report's own number, printed as the engine used to print it ("10.5"); #102 formats it for the locale.
  'conversion.energyFromRuminant': (p) => ({ mj: String(p.mj) }),
  'conversion.proteinFromCrude': (p) => ({ grams: String(p.grams) }),
}

/** Every code the engine can return. A unit test checks that each has a catalogue entry. */
export const DOMAIN_CODES = Object.keys(FORMAT) as Code[]

// A code without a catalogue entry is a compile error here (and fails the unit test at run time).
type MissingKeys = Exclude<`domain.${Code}`, ParseKeys>
const allKeysExist: [MissingKeys] extends [never] ? true : MissingKeys = true
// eslint-disable-next-line @typescript-eslint/no-meaningless-void-operator -- marks the compile-time check as used
void allKeysExist

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
