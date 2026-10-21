import { useTranslation } from 'react-i18next'
import type { InputError } from '@fodr/domain/validation'
import type { NutrientKey } from '@fodr/domain/nutrients'
import { etikett } from '../format'
import { domainText } from '../i18n/domain'

const FEED_ROW = /^nuvarandeFoder\.(\d+)\.gramPerDag$/

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
    if (field.startsWith('perKgTs.')) return etikett(field.slice('perKgTs.'.length) as NutrientKey)
    switch (field) {
      case 'alderAr':
        return t('horse.age')
      case 'viktKg':
        return t('horse.weight')
      case 'viktVidNormalHullKg':
        return t('plan.invalid.normalWeight')
      case 'hull':
        return t('plan.invalid.hull')
      case 'ridning.passPerVecka':
        return t('horse.sessionsPerWeek')
      case 'ridning.minuterPerPass':
        return t('horse.minutesPerSession')
      case 'ridning.travGaloppMinPerPass':
        return t('horse.trotCanter')
      case 'miljo.timmarUtePerDag':
        return t('horse.environment.hoursOut')
      case 'miljo.lagstaTempC':
        return t('horse.environment.lowestTemp')
      case 'grovfoder.kgPerDag':
        return t('horse.roughageKg')
      case 'tsProcent':
        return t('analysis.dryMatter')
      case 'askaGPerKgTs':
        return t('analysis.ash')
      default:
        return field
    }
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
