// Messages the engine returns instead of sentences (ADR 0014). The web app renders each code from its catalogue at
// `domain.<code>` and formats the params for the active locale. Params hold raw numbers and data (product names,
// ids), never text written for a reader.

/** A message code with its parameters. */
export interface Message<C extends string, P extends object = Record<string, never>> {
  code: C
  params: P
}

/** Why today's concentrate is swapped for a similar, cheaper one (swaps.ts). */
export type LiknandeSkal = Message<'swapReason.samePackCheaper'> | Message<'swapReason.sameEnergy'>

/** Why today's mineral feed or salt is swapped for the one the selection chose (plan.ts). */
export type UrvalsSkal =
  Message<'swapReason.coversNeedCheaper', { savingKr: number }> | Message<'swapReason.coversBetter'>

/** Why a feed is swapped for another. */
export type Byteskal = LiknandeSkal | UrvalsSkal

export type ActionMessage =
  | Message<'action.removeConcentrate', { product: string; grams: number }>
  | Message<
      'action.swapCheaper',
      { from: string; fromGrams: number; to: string; toGrams: number; reason: LiknandeSkal; savingKr: number }
    >
  | Message<'action.reduceRoughage', { fromKg: number; toKg: number; minimumKg: number }>
  | Message<'action.increaseRoughage', { fromKg: number; toKg: number }>
  | Message<'action.roughageLacksEnergy'>
  | Message<'action.proteinShort'>
  | Message<'action.continueSupplement', { product: string; grams: number }>
  | Message<'action.changeSupplement', { product: string; fromGrams: number; toGrams: number }>
  | Message<
      'action.swapSupplement',
      { from: string; fromGrams: number; to: string; toGrams: number; reason: UrvalsSkal }
    >
  | Message<'action.stopSupplement', { product: string; grams: number; costKr: number }>
  | Message<'action.giveSupplement', { product: string; grams: number }>

export type Varning =
  | Message<'warning.roughageBelowMinimum', { kgDm: number; minimumKgDm: number }>
  | Message<'warning.metabolicVet'>
  | Message<'warning.sugarMissing'>
  | Message<'warning.sugarHigh', { sugarG: number; limitG: number }>
  | Message<'warning.ulcerPssmVet'>

export type Notering =
  | Message<'note.incompleteDeclaration', { product: string }>
  | Message<'note.unknownFeed', { name: string }>
  | Message<'note.normalConditionWeight', { kg: number }>
  | Message<'note.workFromDiscipline'>
  | Message<'note.sweatSalt'>
  | Message<'note.coldSupplement', { mj: number; degreesBelow: number }>
  | Message<'note.coldWorking'>
  | Message<'note.looseHousing'>
  | Message<'note.weightOutsideBreed', { kg: number; breedId: string; minKg: number; maxKg: number }>
  | Message<'note.senior'>

/** The row of SLU table 15, or the column of table 17, that a requirement comes from. */
export type SluNiva = 'underhall' | 'arbete' | 'arbeteUnder30' | 'arbete30to50' | 'arbete50to75' | 'arbete75to130'

/** Where a requirement comes from: SLU Rapport 289, as data. */
export type Kallhanvisning =
  | Message<'source.energy'>
  | Message<'source.proteinPerMJ'>
  | Message<'source.macroMinerals', { level: SluNiva }>
  | Message<'source.sodium', { level: SluNiva }>
  | Message<'source.concentrateGuidelines'>
  | Message<'source.microMinerals', { level: SluNiva }>
  | Message<'source.vitamins'>

export type ErrorMessage = Message<'error.adultsOnly', { minAgeYears: number }>

export type DomainMessage = Byteskal | ActionMessage | Varning | Notering | Kallhanvisning | ErrorMessage

/** An input the engine cannot calculate for. The message says why, for the web app to render. */
export class DomainError extends Error {
  readonly meddelande: ErrorMessage

  constructor(meddelande: ErrorMessage) {
    super(meddelande.code)
    this.name = 'DomainError'
    this.meddelande = meddelande
  }
}
