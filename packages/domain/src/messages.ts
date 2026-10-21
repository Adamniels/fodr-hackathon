// Messages the engine returns instead of sentences (ADR 0014). The web app renders each code from its catalogue at
// `domain.<code>` and formats the params for the active locale. Params hold raw numbers and data (product names,
// ids), never text written for a reader.

import type { NutrientKey } from './nutrients'
import type { Ingrediens } from './types'

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

/** Where a requirement or a statement comes from: SLU Rapport 289, or a source marked as not SLU, as data. */
export type Kallhanvisning =
  | Message<'source.energy'>
  | Message<'source.proteinPerMJ'>
  | Message<'source.macroMinerals', { level: SluNiva }>
  | Message<'source.sodium', { level: SluNiva }>
  | Message<'source.concentrateGuidelines'>
  | Message<'source.microMinerals', { level: SluNiva }>
  | Message<'source.vitamins'>
  | Message<'source.table32'>
  | Message<'source.page20'>
  | Message<'source.page30'>
  | Message<'source.concentrateGuidelinesPage33'>
  | Message<'source.industryPracticePage34'>
  | Message<'source.eurofinsSoil'>
  | Message<'source.industryPractice'>
  | Message<'source.fodrRules'>
  | Message<'source.productDescriptions'>
  | Message<'source.typicalForage'>
  | Message<'source.typicalForageLowSelenium'>
  | Message<'source.table26Timothy'>
  | Message<'source.table29Grass'>
  | Message<'source.table24CaroteneLower'>
  | Message<'source.table24Lower'>
  | Message<'source.table24FieldDriedHay'>
  | Message<'source.table24'>

/** The horse group of SLU table 32 that a roughage is judged for. */
export type Tabell32Grupp = 'hart' | 'ovriga'

/** The heading of a roughage quality flag (quality.ts). */
export type QualityTitle =
  | Message<'qualityTitle.proteinHigh'>
  | Message<'qualityTitle.proteinLow'>
  | Message<'qualityTitle.energyHigh'>
  | Message<'qualityTitle.energyLow'>
  | Message<'qualityTitle.haylageWet'>
  | Message<'qualityTitle.haylageDry'>
  | Message<'qualityTitle.soil'>
  | Message<'qualityTitle.sugarHigh'>
  | Message<'qualityTitle.seleniumMissing'>

/** What a roughage quality flag says (quality.ts). Ratios in g digestible protein per MJ, contents per kg DM. */
export type QualityMessage =
  | Message<'quality.proteinHigh', { ratio: number; min: number; max: number; group: Tabell32Grupp }>
  | Message<'quality.proteinLow', { ratio: number; min: number }>
  | Message<'quality.energyHigh', { mj: number; min: number; max: number; group: Tabell32Grupp }>
  | Message<'quality.energyLow', { mj: number; min: number; group: Tabell32Grupp }>
  | Message<'quality.haylageWet', { dmPercent: number }>
  | Message<'quality.haylageDry', { dmPercent: number }>
  | Message<'quality.soilAsh', { ashG: number }>
  | Message<'quality.soilIron', { ironMg: number }>
  | Message<'quality.soilAshIron', { ashG: number; ironMg: number }>
  | Message<'quality.sugarHigh', { sugarG: number }>
  | Message<'quality.seleniumMissing'>

/** Why a product does not suit the horse (sensitivity.ts). Ingredients are the stored identifiers. */
export type Uteslutningsskal =
  | Message<'exclusion.sugarStarch'>
  | Message<'exclusion.grainOrStarch'>
  | Message<'exclusion.powder'>
  | Message<'exclusion.containsIngredient', { ingredient: Ingrediens }>
  | Message<'exclusion.proteinFeed'>

/** Advice from the horse's sensitivities about today's feed and the ration (sensitivity.ts). */
export type SensitivityMessage =
  | Message<'sensitivity.currentFeed', { product: string; reasons: Uteslutningsskal[] }>
  | Message<'sensitivity.ulcer', { starchPerMealG: number }>
  | Message<'sensitivity.pssm'>
  | Message<'sensitivity.airways'>
  | Message<'sensitivity.teeth'>
  | Message<'sensitivity.proteinExcess', { percent: number }>
  | Message<'sensitivity.avoidedIngredients', { ingredients: Ingrediens[] }>

/** A warning from the journal's weight and condition trend (journal.ts). The loss is a positive percentage. */
export type Trendvarning =
  Message<'trend.weightLossFast', { percentPerWeek: number }> | Message<'trend.conditionRising'>

/**
 * Why the selection could not add any supplement at all (optimize.ts, C3): the roughage alone already exceeds an SLU
 * maximum (check the analysis value), the roughage with the kept feeds does (look at those feeds), or no combination
 * reaches Ca:P 1,1 within the maximums.
 */
export type Urvalshinder =
  | Message<'infeasible.roughageOverMax', { nutrients: NutrientKey[] }>
  | Message<'infeasible.overMax', { nutrients: NutrientKey[] }>
  | Message<'infeasible.caP', { minRatio: number }>

/** Why a number in a horse profile or an analysis cannot be used (validation.ts). */
export type ValidationMessage =
  | Message<'validation.range', { min: number; max: number }>
  | Message<'validation.wholeRange', { min: number; max: number }>
  | Message<'validation.atLeast', { min: number }>
  | Message<'validation.positiveUpTo', { min: number; max: number }>
  | Message<'validation.adultsOnly', { minAgeYears: number }>
  | Message<'validation.trotWithinRide'>
  | Message<'validation.date'>

/** Why a read report cannot become an analysis (analysis.ts). */
export type AnalysisErrorMessage = Message<'analysis.notAnAnalysis'> | Message<'analysis.missingDryMatter'>

/** How a value was converted with an SLU formula, with the raw value the report gave (analysis.ts). */
export type ConversionMessage =
  Message<'conversion.energyFromRuminant', { mj: number }> | Message<'conversion.proteinFromCrude', { grams: number }>

export type DomainMessage =
  | Byteskal
  | ActionMessage
  | Varning
  | Notering
  | Kallhanvisning
  | QualityTitle
  | QualityMessage
  | Uteslutningsskal
  | SensitivityMessage
  | Trendvarning
  | Urvalshinder
  | ValidationMessage
  | AnalysisErrorMessage
  | ConversionMessage
