import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { InputError } from '@fodr/domain/validation'
import type { NutrientKey } from '@fodr/domain/nutrients'
import { nutrientLabel } from '../format'
import { domainText } from '../i18n/domain'

const FEED_ROW = /^nuvarandeFoder\.(\d+)\.gramPerDag$/

/** Fields with a fixed label; feed rows and nutrients are named from their row and nutrient. */
type NamedField = Exclude<InputError['field'], `nuvarandeFoder.${number}.gramPerDag` | `perKgTs.${string}`>

// A Record over every named field, so a new field without a label is a compile error.
const LABELS: Record<NamedField, ParseKeys> = {
  alderAr: 'horse.age',
  viktKg: 'horse.weight',
  viktVidNormalHullKg: 'plan.invalid.normalWeight',
  hull: 'plan.invalid.hull',
  'ridning.passPerVecka': 'horse.sessionsPerWeek',
  'ridning.minuterPerPass': 'horse.minutesPerSession',
  'ridning.travGaloppMinPerPass': 'horse.trotCanter',
  'miljo.timmarUtePerDag': 'horse.environment.hoursOut',
  'miljo.lagstaTempC': 'horse.environment.lowestTemp',
  'grovfoder.kgPerDag': 'horse.roughageKg',
  tsProcent: 'analysis.dryMatter',
  askaGPerKgTs: 'analysis.ash',
}

/** Shown instead of a plan when the engine refuses the input (C1, #13): what to correct, and where. */
export function InvalidInput({
  errors,
  onToHorse,
  onToAnalysis,
}: {
  errors: InputError[]
  onToHorse: () => void
  onToAnalysis: () => void
}) {
  const { t } = useTranslation()

  const label = (field: InputError['field']): string => {
    const row = FEED_ROW.exec(field)
    if (row) return t('plan.invalid.feedRow', { row: String(Number(row[1]) + 1) })
    if (field.startsWith('perKgTs.')) return nutrientLabel(field.slice('perKgTs.'.length) as NutrientKey)
    return t(LABELS[field as NamedField])
  }
  const inAnalysis = (field: InputError['field']) =>
    field === 'tsProcent' || field === 'askaGPerKgTs' || field.startsWith('perKgTs.')

  return (
    <section className="kort">
      <h2>{t('plan.invalid.title')}</h2>
      <p className="ingress">{t('plan.invalid.intro')}</p>
      <ul>
        {errors.map((e) => (
          <li key={e.field}>
            {label(e.field)}: {domainText(e.message)}
          </li>
        ))}
      </ul>
      {errors.some((e) => !inAnalysis(e.field)) && (
        <button className="knapp" onClick={onToHorse}>
          {t('plan.invalid.toHorse')}
        </button>
      )}{' '}
      {errors.some((e) => inAnalysis(e.field)) && (
        <button className="knapp" onClick={onToAnalysis}>
          {t('plan.invalid.toAnalysis')}
        </button>
      )}
    </section>
  )
}
