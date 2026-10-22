import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ANALYSIS_FILE_LIMITS } from '@fodr/contracts/analyses'
import { reportProblem, type AnalysisStore } from '../analyses'
import { ApiError } from '../api-v1'
import type { AnalysisErrorMessage } from '@fodr/domain/messages'
import { hittaSchablon } from '@fodr/domain/forage'
import type { NutrientKey, NutrientValues } from '@fodr/domain/nutrients'
import { validateAnalysis, type AnalysisField } from '@fodr/domain/validation'
import type { Hastprofil } from '@fodr/domain/types'
import { analysisUnit, nutrientLabel, formatDate, formatNumber } from '../format'
import { domainText } from '../i18n/domain'
import { DecimalInput } from './DecimalInput'
import { SaveStatus } from './SaveStatus'

interface Props {
  hast: Hastprofil
  /** The horse's analysis on the API (#26). */
  analyses: AnalysisStore
  onNext: () => void
}

const MB = 1024 * 1024

// The API's problem codes for a report it would not read or store, and the text for each (ADR 0013, ADR 0014).
const DOMAIN_CODES = new Set<string>(['analysis.notAnAnalysis', 'analysis.missingDryMatter'])

function uploadErrorText(code: string | undefined, t: TFunction): string {
  if (code && DOMAIN_CODES.has(code)) return domainText({ code, params: {} } as AnalysisErrorMessage)
  switch (code) {
    case 'analysis.unsupported_type':
      return t('analysis.upload.unsupportedType')
    case 'analysis.too_large':
      return t('analysis.upload.tooLarge', {
        pdf: formatNumber(ANALYSIS_FILE_LIMITS['application/pdf'] / MB, 0),
        image: formatNumber(ANALYSIS_FILE_LIMITS['image/png'] / MB, 0),
      })
    case 'ai.rate_limited':
      return t('analysis.upload.aiBusy')
    case 'ai.unavailable':
      return t('analysis.upload.aiUnavailable')
    default:
      return t('analysis.upload.failed')
  }
}

const SHOWN_NUTRIENTS: NutrientKey[] = [
  'energi',
  'smbRp',
  'socker',
  'starkelse',
  'ca',
  'p',
  'mg',
  'na',
  'fe',
  'mn',
  'cu',
  'zn',
  'co',
  'jod',
  'se',
]

export function AnalysisStep({ hast, analyses, onNext }: Props) {
  const { t } = useTranslation()
  const [laddar, setLaddar] = useState(false)
  const [fel, setFel] = useState<string | null>(null)
  const [filnamn, setFilnamn] = useState<string | null>(null)
  const analys = analyses.current?.analys ?? null
  const omrakningar = analyses.current?.omrakningar ?? []
  const anmarkningar = analyses.current?.anmarkningar ?? []
  const onAnalysisChange = analyses.correct

  // An API failure becomes text from its code; anything else (the network) the general failure.
  const errorText = (e: unknown) => uploadErrorText(e instanceof ApiError ? e.code : undefined, t)

  async function laddaUpp(fil: File) {
    setFel(null)
    // Refused before upload (CF4); the API checks the type and size again.
    const problem = reportProblem(fil)
    if (problem) {
      setFel(uploadErrorText(problem, t))
      return
    }
    setLaddar(true)
    setFilnamn(fil.name)
    try {
      await analyses.upload(fil)
    } catch (e) {
      setFel(errorText(e))
    } finally {
      setLaddar(false)
    }
  }

  const errors = useMemo(() => (analys ? validateAnalysis(analys) : []), [analys])
  const errorFor = (field: AnalysisField) => {
    const error = errors.find((e) => e.field === field)
    return error && domainText(error.message)
  }

  /** A typed value, or undefined when the field is cleared: the value is then missing, never 0. */
  const andra = (k: NutrientKey, v: number | undefined) => {
    if (!analys) return
    // A cleared value is missing, so its key goes rather than becoming undefined or 0.
    const perKgTs: NutrientValues =
      v === undefined
        ? Object.fromEntries(Object.entries(analys.perKgTs).filter(([key]) => key !== k))
        : { ...analys.perKgTs, [k]: v }
    onAnalysisChange(
      { ...analys, perKgTs },
      omrakningar.filter((o) => o.amne !== k),
    )
  }

  return (
    <section className="kort">
      <h2>{t('analysis.title', { name: hast.namn })}</h2>
      <p className="ingress">{t('analysis.intro')}</p>

      {/* Hidden while the stored analysis could not be read, so an upload never replaces one the page cannot show. */}
      {!analyses.loadFailed && (
        <label className={`uppladdning ${laddar ? 'laddar' : ''}`}>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const fil = e.target.files?.[0]
              if (fil) void laddaUpp(fil)
            }}
            disabled={laddar}
          />
          {laddar ? (
            <span>{t('analysis.reading', { file: filnamn })}</span>
          ) : (
            <span>
              <Trans i18nKey="analysis.choose" components={{ strong: <strong /> }} />
            </span>
          )}
        </label>
      )}
      {fel && (
        <div className="ruta fel" role="alert">
          {fel}
        </div>
      )}
      {analyses.current === undefined && <p role="status">{t('analysis.loading')}</p>}
      {analyses.loadFailed && (
        <div className="ruta fel" role="alert">
          {t('analysis.loadFailed')}{' '}
          <button className="lank" onClick={analyses.reload}>
            {t('analysis.retry')}
          </button>
        </div>
      )}

      {analys && (
        <>
          <SaveStatus state={analyses.saveState} onRetry={analyses.retrySave} />
          <div className="analyshuvud">
            <span>{t(analys.typ === 'hosilage' ? 'roughageTitle.hosilage' : 'roughageTitle.ho')}</span>
            {analys.labb && <span>{analys.labb}</span>}
            {analys.provdatum && <span>{t('analysis.sampled', { date: formatDate(analys.provdatum) })}</span>}
            <label>
              {t('analysis.dryMatter')}{' '}
              <DecimalInput
                className="smal"
                value={analys.tsProcent}
                error={errorFor('tsProcent')}
                onChange={(tsProcent) => onAnalysisChange({ ...analys, tsProcent }, omrakningar)}
              />{' '}
              %
            </label>
            <label>
              {t('analysis.ash')}{' '}
              <DecimalInput
                className="smal"
                value={analys.askaGPerKgTs}
                placeholder="–"
                error={errorFor('askaGPerKgTs')}
                onChange={(askaGPerKgTs) => onAnalysisChange({ ...analys, askaGPerKgTs }, omrakningar)}
                onClear={() => onAnalysisChange({ ...analys, askaGPerKgTs: undefined }, omrakningar)}
              />{' '}
              {t('units.perKgDm', { unit: 'g' })}
            </label>
          </div>
          <table className="tabell">
            <thead>
              <tr>
                <th>{t('analysis.columns.nutrient')}</th>
                <th>{t('analysis.columns.value')}</th>
                <th>{t('analysis.columns.unit')}</th>
                <th>{t('analysis.columns.source')}</th>
              </tr>
            </thead>
            <tbody>
              {SHOWN_NUTRIENTS.map((k) => {
                const v = analys.perKgTs[k]
                const omr = omrakningar.find((o) => o.amne === k)
                const schablon = hittaSchablon(analys.typ, k)
                return (
                  <tr key={k} className={v === undefined ? 'saknas' : ''}>
                    <td>{nutrientLabel(k)}</td>
                    <td>
                      <DecimalInput
                        className="smal"
                        value={v}
                        placeholder="–"
                        label={nutrientLabel(k)}
                        error={errorFor(`perKgTs.${k}`)}
                        onChange={(n) => andra(k, n)}
                        onClear={() => andra(k, undefined)}
                      />
                    </td>
                    <td className="enhet">{analysisUnit(k)}</td>
                    <td className="kalla">
                      {v !== undefined
                        ? omr
                          ? domainText(omr.message)
                          : t('analysis.source.report')
                        : schablon
                          ? t('analysis.source.estimated', { source: domainText(schablon.kalla) })
                          : t('analysis.source.missing')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {anmarkningar.length > 0 && (
            <div className="ruta varn">
              <strong>{t('analysis.toCheck')}</strong>
              <ul>
                {anmarkningar.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="atgardsrad">
            <button className="knapp" onClick={onNext} disabled={analys.perKgTs.energi === undefined}>
              {t('analysis.toPlan')}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
