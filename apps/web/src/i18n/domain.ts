import type { ParseKeys } from 'i18next'
import type { DomainMessage } from '@fodr/domain/messages'
import { hittaRas } from '@fodr/domain/breeds'
import { kr, tal } from '../format'
import i18n from '.'

// Renders the engine's message codes (ADR 0014). Each code has its text at domain.<code> in the catalogue and a
// formatter here that turns its params into strings; the mapped type makes a missing formatter a compile error.

type Kod = DomainMessage['code']
type Params<C extends Kod> = Extract<DomainMessage, { code: C }>['params']
type Formatter<C extends Kod> = (params: Params<C>) => Record<string, string>

/** Grams per day, whole as in the shopping list; a dose typed with a decimal rounds. */
const gram = (n: number): string => tal(n, 0)

const sluNiva = (level: Params<'source.sodium'>['level']) => i18n.t(`domain.sluLevel.${level}`)

const tom = () => ({})

const FORMAT: { [C in Kod]: Formatter<C> } = {
  'swapReason.samePackCheaper': tom,
  'swapReason.sameEnergy': tom,
  'swapReason.coversNeedCheaper': (p) => ({ saving: kr(p.savingKr) }),
  'swapReason.coversBetter': tom,
  'action.removeConcentrate': (p) => ({ product: p.product, grams: gram(p.grams) }),
  'action.swapCheaper': (p) => ({
    from: p.from,
    fromGrams: gram(p.fromGrams),
    to: p.to,
    toGrams: gram(p.toGrams),
    reason: domainText(p.reason),
    saving: kr(p.savingKr),
  }),
  'action.reduceRoughage': (p) => ({ fromKg: tal(p.fromKg, 1), toKg: tal(p.toKg, 1), minimumKg: tal(p.minimumKg, 1) }),
  'action.increaseRoughage': (p) => ({ fromKg: tal(p.fromKg, 1), toKg: tal(p.toKg, 1) }),
  'action.roughageLacksEnergy': tom,
  'action.proteinShort': tom,
  'action.continueSupplement': (p) => ({ product: p.product, grams: gram(p.grams) }),
  'action.changeSupplement': (p) => ({ product: p.product, fromGrams: gram(p.fromGrams), toGrams: gram(p.toGrams) }),
  'action.swapSupplement': (p) => ({
    from: p.from,
    fromGrams: gram(p.fromGrams),
    to: p.to,
    toGrams: gram(p.toGrams),
    reason: domainText(p.reason),
  }),
  'action.stopSupplement': (p) => ({ product: p.product, grams: gram(p.grams), cost: kr(p.costKr) }),
  'action.giveSupplement': (p) => ({ product: p.product, grams: gram(p.grams) }),
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
  'error.adultsOnly': (p) => ({ minAgeYears: tal(p.minAgeYears, 0) }),
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
