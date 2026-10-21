// Messages the engine returns instead of sentences (ADR 0014). The web app renders each code from its catalogue at
// `domain.<code>` and formats the params for the active locale. Params hold raw numbers and data (product names,
// ids), never text written for a reader.

/** A message code with its parameters. */
export interface Meddelande<C extends string, P extends object = Record<string, never>> {
  code: C
  params: P
}

/** Why today's concentrate is swapped for a similar, cheaper one (swaps.ts). */
export type LiknandeSkal = Meddelande<'swapReason.samePackCheaper'> | Meddelande<'swapReason.sameEnergy'>

/** Why today's mineral feed or salt is swapped for the one the selection chose (plan.ts). */
export type UrvalsSkal =
  Meddelande<'swapReason.coversNeedCheaper', { savingKr: number }> | Meddelande<'swapReason.coversBetter'>

/** Why a feed is swapped for another. */
export type Byteskal = LiknandeSkal | UrvalsSkal

export type AtgardMeddelande =
  | Meddelande<'action.removeConcentrate', { product: string; grams: number }>
  | Meddelande<
      'action.swapCheaper',
      { from: string; fromGrams: number; to: string; toGrams: number; reason: LiknandeSkal; savingKr: number }
    >
  | Meddelande<'action.reduceRoughage', { fromKg: number; toKg: number; minimumKg: number }>
  | Meddelande<'action.increaseRoughage', { fromKg: number; toKg: number }>
  | Meddelande<'action.roughageLacksEnergy'>
  | Meddelande<'action.proteinShort'>
  | Meddelande<'action.continueSupplement', { product: string; grams: number }>
  | Meddelande<'action.changeSupplement', { product: string; fromGrams: number; toGrams: number }>
  | Meddelande<
      'action.swapSupplement',
      { from: string; fromGrams: number; to: string; toGrams: number; reason: UrvalsSkal }
    >
  | Meddelande<'action.stopSupplement', { product: string; grams: number; costKr: number }>
  | Meddelande<'action.giveSupplement', { product: string; grams: number }>

export type Varning =
  | Meddelande<'warning.roughageBelowMinimum', { kgDm: number; minimumKgDm: number }>
  | Meddelande<'warning.metabolicVet'>
  | Meddelande<'warning.sugarMissing'>
  | Meddelande<'warning.sugarHigh', { sugarG: number; limitG: number }>
  | Meddelande<'warning.ulcerPssmVet'>

export type Notering =
  | Meddelande<'note.incompleteDeclaration', { product: string }>
  | Meddelande<'note.unknownFeed', { name: string }>
  | Meddelande<'note.normalConditionWeight', { kg: number }>
  | Meddelande<'note.workFromDiscipline'>
  | Meddelande<'note.sweatSalt'>
  | Meddelande<'note.coldSupplement', { mj: number; degreesBelow: number }>
  | Meddelande<'note.coldWorking'>
  | Meddelande<'note.looseHousing'>
  | Meddelande<'note.weightOutsideBreed', { kg: number; breedId: string; minKg: number; maxKg: number }>
  | Meddelande<'note.senior'>

/** The row of SLU table 15, or the column of table 17, that a requirement comes from. */
export type SluNiva = 'underhall' | 'arbete' | 'arbeteUnder30' | 'arbete30to50' | 'arbete50to75' | 'arbete75to130'

/** Where a requirement comes from: SLU Rapport 289, as data. */
export type Kallhanvisning =
  | Meddelande<'source.energy'>
  | Meddelande<'source.proteinPerMJ'>
  | Meddelande<'source.macroMinerals', { level: SluNiva }>
  | Meddelande<'source.sodium', { level: SluNiva }>
  | Meddelande<'source.concentrateGuidelines'>
  | Meddelande<'source.microMinerals', { level: SluNiva }>
  | Meddelande<'source.vitamins'>

export type FelMeddelande = Meddelande<'error.adultsOnly', { minAgeYears: number }>

export type DomanMeddelande = Byteskal | AtgardMeddelande | Varning | Notering | Kallhanvisning | FelMeddelande

/** An input the engine cannot calculate for. The message says why, for the web app to render. */
export class DomanFel extends Error {
  readonly meddelande: FelMeddelande

  constructor(meddelande: FelMeddelande) {
    super(meddelande.code)
    this.name = 'DomanFel'
    this.meddelande = meddelande
  }
}
