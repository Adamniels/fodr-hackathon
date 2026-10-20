import type { ParseKeys } from 'i18next'
import type { DomanMeddelande } from '@fodr/domain/meddelanden'
import { hittaRas } from '@fodr/domain/raser'
import { tal } from '../format'
import i18n from '.'

// Renders the engine's message codes (ADR 0014). Each code has its text at domain.<code> in the catalogue and a
// formatter here that turns its params into strings; the mapped type makes a missing formatter a compile error.

type Kod = DomanMeddelande['code']
type Params<C extends Kod> = Extract<DomanMeddelande, { code: C }>['params']
type Formatter<C extends Kod> = (params: Params<C>) => Record<string, string>

/**
 * A number the engine used to interpolate unformatted ("1000 g", "545.5 kg"). Kept as it was so that moving to codes
 * changes no text (#11); a follow-up fix formats these with tal() and then removes this function.
 */
const oformaterat = (n: number): string => String(n)

/** Whole kronor as the engine wrote them: rounded, digits grouped, " kr" added by the catalogue. */
const kronor = (n: number): string => tal(Math.round(n), 0)

const sluNiva = (level: Params<'source.sodium'>['level']) => i18n.t(`domain.sluLevel.${level}`)

const tom = () => ({})

const FORMAT: { [C in Kod]: Formatter<C> } = {
  'swapReason.samePackCheaper': tom,
  'swapReason.sameEnergy': tom,
  'swapReason.coversNeedCheaper': (p) => ({ saving: kronor(p.savingKr) }),
  'swapReason.coversBetter': tom,
  'action.removeConcentrate': (p) => ({ product: p.product, grams: oformaterat(p.grams) }),
  'action.swapCheaper': (p) => ({
    from: p.from,
    fromGrams: oformaterat(p.fromGrams),
    to: p.to,
    toGrams: oformaterat(p.toGrams),
    reason: domainText(p.reason),
    saving: kronor(p.savingKr),
  }),
  'action.reduceRoughage': (p) => ({ fromKg: tal(p.fromKg, 1), toKg: tal(p.toKg, 1), minimumKg: tal(p.minimumKg, 1) }),
  'action.increaseRoughage': (p) => ({ fromKg: tal(p.fromKg, 1), toKg: tal(p.toKg, 1) }),
  'action.roughageLacksEnergy': tom,
  'action.proteinShort': tom,
  'action.continueSupplement': (p) => ({ product: p.product, grams: oformaterat(p.grams) }),
  'action.changeSupplement': (p) => ({
    product: p.product,
    fromGrams: oformaterat(p.fromGrams),
    toGrams: oformaterat(p.toGrams),
  }),
  'action.swapSupplement': (p) => ({
    from: p.from,
    fromGrams: oformaterat(p.fromGrams),
    to: p.to,
    toGrams: oformaterat(p.toGrams),
    reason: domainText(p.reason),
  }),
  'action.stopSupplement': (p) => ({ product: p.product, grams: oformaterat(p.grams), cost: kronor(p.costKr) }),
  'action.giveSupplement': (p) => ({ product: p.product, grams: oformaterat(p.grams) }),
  'warning.roughageBelowMinimum': (p) => ({ kgDm: tal(p.kgDm, 1), minimumKgDm: tal(p.minimumKgDm, 1) }),
  'warning.metabolicVet': tom,
  'warning.sugarMissing': tom,
  'warning.sugarHigh': (p) => ({ sugarG: tal(p.sugarG, 1), limitG: oformaterat(p.limitG) }),
  'warning.ulcerPssmVet': tom,
  'note.incompleteDeclaration': (p) => ({ product: p.product }),
  'note.unknownFeed': (p) => ({ name: p.name }),
  'note.normalConditionWeight': (p) => ({ kg: oformaterat(Math.round(p.kg)) }),
  'note.workFromDiscipline': tom,
  'note.sweatSalt': tom,
  'note.coldSupplement': (p) => ({
    mj: oformaterat(Math.round(p.mj * 10) / 10),
    degreesBelow: oformaterat(p.degreesBelow),
  }),
  'note.coldWorking': tom,
  'note.looseHousing': tom,
  'note.weightOutsideBreed': (p) => ({
    kg: oformaterat(p.kg),
    // Breed names are still Swedish data in the engine; they move to the catalogue with the rest of raser.ts.
    breed: hittaRas(p.breedId)?.namn.toLowerCase() ?? p.breedId,
    minKg: oformaterat(p.minKg),
    maxKg: oformaterat(p.maxKg),
  }),
  'note.senior': tom,
  'source.energy': tom,
  'source.proteinPerMJ': tom,
  'source.macroMinerals': (p) => ({ level: sluNiva(p.level) }),
  'source.sodium': (p) => ({ level: sluNiva(p.level) }),
  'source.concentrateGuidelines': tom,
  'source.microMinerals': (p) => ({ level: sluNiva(p.level) }),
  'source.vitamins': tom,
  'error.adultsOnly': (p) => ({ minAgeYears: oformaterat(p.minAgeYears) }),
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
export function domainText(meddelande: DomanMeddelande): string {
  const format = FORMAT[meddelande.code] as (params: DomanMeddelande['params']) => Record<string, string>
  return t(`domain.${meddelande.code}`, format(meddelande.params))
}
