import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { fileToBase64, readAnalysis } from '../api'
import { analysBas, analysKomplett } from '../data/examples'
import { tillGrovfoderanalys, type Omrakning } from '@fodr/domain/analysis'
import { hittaSchablon } from '@fodr/domain/forage'
import type { NutrientKey, NutrientValues } from '@fodr/domain/nutrients'
import { validateAnalysis, type AnalysisField } from '@fodr/domain/validation'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import { analysisUnit, nutrientLabel, formatDate } from '../format'
import { domainText } from '../i18n/domain'
import { DecimalInput } from './DecimalInput'

interface Props {
  hast: Hastprofil
  analys: Grovfoderanalys | null
  omrakningar: Omrakning[]
  onAnalysisChange: (a: Grovfoderanalys, o: Omrakning[]) => void
  onNext: () => void
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

export function AnalysisStep({ hast, analys, omrakningar, onAnalysisChange, onNext }: Props) {
  const { t } = useTranslation()
  const [laddar, setLaddar] = useState(false)
  const [fel, setFel] = useState<string | null>(null)
  const [anmarkningar, setAnmarkningar] = useState<string[]>([])
  const [filnamn, setFilnamn] = useState<string | null>(null)

  async function laddaUpp(fil: File) {
    setLaddar(true)
    setFel(null)
    setFilnamn(fil.name)
    try {
      const utlast = await readAnalysis(await fileToBase64(fil))
      const result = tillGrovfoderanalys(utlast)
      if ('error' in result) {
        setFel(domainText(result.error))
        return
      }
      setAnmarkningar(utlast.anmarkningar)
      onAnalysisChange(result.analys, result.omrakningar)
    } catch (e) {
      setFel(e instanceof Error ? e.message : String(e))
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
      <div className="exempel">
        {t('analysis.noReport')}{' '}
        <button className="lank" onClick={() => onAnalysisChange(analysKomplett, [])}>
          {t('analysis.exampleComplete')}
        </button>{' '}
        ·{' '}
        <button className="lank" onClick={() => onAnalysisChange(analysBas, [])}>
          {t('analysis.exampleBasic')}
        </button>
      </div>
      {fel && <div className="ruta fel">{fel}</div>}

      {analys && (
        <>
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
                          ? t('analysis.source.estimated', { source: schablon.kalla })
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
