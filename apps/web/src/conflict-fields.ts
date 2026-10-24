// How the notice of a save refused because the server's copy changed (#140) names each changed value and shows it: by
// the label the form gives the field, formatted as the form shows it, both the server's value and the page's.
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import { hittaRas } from '@fodr/domain/breeds'
import type { NutrientKey } from '@fodr/domain/nutrients'
import { changedFields } from './changes'
import { breedName, formatDate, formatNumber, nutrientLabel } from './format'
import i18n from './i18n'

/** One changed value: its label, and the server's and the page's value as text. */
export interface Change {
  field: string
  theirs: string
  mine: string
}

const t = i18n.t as (key: string, options?: Record<string, unknown>) => string

/**
 * A value as text: a missing one says so, never shown as 0 or empty. A number keeps up to two decimals, so two values
 * that differ never read the same.
 */
function plain(value: unknown): string {
  if (value === undefined || value === null) return t('conflict.none')
  if (typeof value === 'number') return formatNumber(value, 2)
  if (typeof value === 'boolean') return t(value ? 'conflict.yes' : 'conflict.no')
  if (typeof value === 'string') return value === '' ? t('conflict.empty') : value
  // Only a list reaches here without a field's own display (an object is compared field by field).
  return JSON.stringify(value)
}

/** A value from a set of choices, by its name in the catalogue under `prefix`. */
const choice =
  (prefix: string, suffix = '') =>
  (value: unknown) =>
    typeof value === 'string' ? t(`${prefix}.${value}${suffix}`) : plain(value)

interface Field {
  label: string
  show?: (value: unknown) => string
}

const HEALTH = ['fang', 'ems', 'ppid', 'magsar', 'pssm', 'luftvagar', 'tandproblem', 'proteinkanslig'] as const

// Every field of the profile; one missing here is named by its path, which a test catches.
const HORSE_FIELDS: Record<string, Field> = {
  namn: { label: 'horse.name' },
  alderAr: { label: 'horse.age' },
  kon: { label: 'horse.sex.label', show: choice('horse.sex') },
  typ: { label: 'horse.type.label', show: choice('horse.type', '.name') },
  viktKg: { label: 'horse.weight' },
  hull: { label: 'plan.invalid.hull' },
  viktVidNormalHullKg: { label: 'plan.invalid.normalWeight' },
  ras: {
    label: 'horse.breed',
    show: (v) => (typeof v === 'string' && hittaRas(v) ? breedName(v) : plain(v)),
  },
  'ridning.passPerVecka': { label: 'horse.sessionsPerWeek' },
  'ridning.minuterPerPass': { label: 'horse.minutesPerSession' },
  'ridning.travGaloppMinPerPass': { label: 'horse.trotCanter' },
  // Not in the form: set only through the API, shown by its code.
  arbetsniva: { label: 'conflict.workLevel' },
  prestanda: { label: 'horse.discipline', show: choice('horse.performance') },
  'miljo.hallning': { label: 'horse.environment.housing', show: choice('horse.environment') },
  'miljo.timmarUtePerDag': { label: 'horse.environment.hoursOut' },
  'miljo.klippt': { label: 'horse.environment.clipped' },
  'miljo.tacke': { label: 'horse.environment.rug' },
  'miljo.lagstaTempC': { label: 'horse.environment.lowestTemp' },
  ...Object.fromEntries(HEALTH.map((k) => [`halsa.${k}`, { label: `horse.health.${k}` }])),
  'halsa.undvik': {
    label: 'horse.health.avoid',
    show: (v) => (Array.isArray(v) && v.length > 0 ? v.join(', ') : t('conflict.none')),
  },
  'halsa.ovrigt': { label: 'horse.other' },
  bytekanslighet: { label: 'conflict.sensitivity', show: choice('transitionPace', '.name') },
  'grovfoder.typ': { label: 'horse.roughage', show: choice('roughageTitle') },
  'grovfoder.kgPerDag': { label: 'horse.roughageKg' },
  nuvarandeFoder: {
    label: 'conflict.feeds',
    show: (v) =>
      Array.isArray(v) && v.length > 0
        ? (v as Hastprofil['nuvarandeFoder'])
            .map((f) => t('conflict.feed', { name: f.namn, grams: formatNumber(f.gramPerDag, 0) }))
            .join('; ')
        : t('conflict.none'),
  },
}

const ANALYSIS_FIELDS: Record<string, Field> = {
  typ: { label: 'horse.roughage', show: choice('roughageTitle') },
  labb: { label: 'conflict.lab' },
  provdatum: { label: 'conflict.sampled', show: (v) => (typeof v === 'string' ? formatDate(v) : plain(v)) },
  tsProcent: { label: 'analysis.dryMatter' },
  askaGPerKgTs: { label: 'analysis.ash' },
}

const NUTRIENT = /^perKgTs\.(.+)$/

/** A changed value's name on screen, and how its value reads. */
interface Described {
  name: string
  show: (value: unknown) => string
}

// A path without a description is named by itself, which the tests catch.
const described = (field: Field | undefined, path: string): Described => ({
  name: field ? t(field.label) : path,
  show: field?.show ?? plain,
})

function changes<T>(mine: T, theirs: T, ignore: readonly string[], describe: (path: string) => Described): Change[] {
  const at = (record: T, path: string) =>
    path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], record)
  return changedFields(mine, theirs, ignore).map((path) => {
    const { name, show } = describe(path)
    return { field: name, theirs: show(at(theirs, path)), mine: show(at(mine, path)) }
  })
}

/** What differs between the page's profile and the server's, the ID aside. */
export const horseChanges = (mine: Hastprofil, theirs: Hastprofil): Change[] =>
  changes(mine, theirs, ['id'], (path) => described(HORSE_FIELDS[path], path))

/** What differs between the page's analysis and the server's. */
export const analysisChanges = (mine: Grovfoderanalys, theirs: Grovfoderanalys): Change[] =>
  changes(mine, theirs, [], (path) => {
    const nutrient = NUTRIENT.exec(path)
    return nutrient
      ? { name: nutrientLabel(nutrient[1] as NutrientKey), show: plain }
      : described(ANALYSIS_FIELDS[path], path)
  })
