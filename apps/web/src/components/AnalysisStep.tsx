import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { filTillBase64, lasAnalys } from '../api'
import { analysBas, analysKomplett } from '../data/exempel'
import { tillGrovfoderanalys, type Omrakning } from '@fodr/domain/analysis'
import { schablonFor } from '@fodr/domain/forage'
import type { NutrientKey } from '@fodr/domain/nutrients'
import type { Grovfoderanalys, Hastprofil } from '@fodr/domain/types'
import { analysEnhet, etikett, formatDate } from '../format'
import { DecimalInput } from './DecimalInput'

interface Props {
  hast: Hastprofil
  analys: Grovfoderanalys | null
  omrakningar: Omrakning[]
  onAnalys: (a: Grovfoderanalys, o: Omrakning[]) => void
  onVidare: () => void
}

const VISADE: NutrientKey[] = [
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

export function AnalysisStep({ hast, analys, omrakningar, onAnalys, onVidare }: Props) {
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
      const utlast = await lasAnalys(await filTillBase64(fil))
      const { analys: a, omrakningar: o } = tillGrovfoderanalys(utlast)
      setAnmarkningar(utlast.anmarkningar)
      onAnalys(a, o)
    } catch (e) {
      setFel(e instanceof Error ? e.message : String(e))
    } finally {
      setLaddar(false)
    }
  }

  const andra = (k: NutrientKey, v: string) => {
    if (!analys) return
    const perKgTs = { ...analys.perKgTs }
    if (v === '') delete perKgTs[k]
    else perKgTs[k] = Number(v.replace(',', '.'))
    onAnalys(
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
        <button className="lank" onClick={() => onAnalys(analysKomplett, [])}>
          {t('analysis.exampleComplete')}
        </button>{' '}
        ·{' '}
        <button className="lank" onClick={() => onAnalys(analysBas, [])}>
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
                onChange={(tsProcent) => onAnalys({ ...analys, tsProcent }, omrakningar)}
              />{' '}
              %
            </label>
            <label>
              {t('analysis.ash')}{' '}
              <input
                className="smal"
                type="number"
                value={analys.askaGPerKgTs ?? ''}
                placeholder="–"
                onChange={(e) =>
                  onAnalys(
                    { ...analys, askaGPerKgTs: e.target.value === '' ? undefined : Number(e.target.value) },
                    omrakningar,
                  )
                }
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
              {VISADE.map((k) => {
                const v = analys.perKgTs[k]
                const omr = omrakningar.find((o) => o.amne === k)
                const schablon = schablonFor(analys.typ, k)
                return (
                  <tr key={k} className={v === undefined ? 'saknas' : ''}>
                    <td>{etikett(k)}</td>
                    <td>
                      <input
                        className="smal"
                        value={v ?? ''}
                        placeholder="–"
                        onChange={(e) => andra(k, e.target.value)}
                      />
                    </td>
                    <td className="enhet">{analysEnhet(k)}</td>
                    <td className="kalla">
                      {v !== undefined
                        ? (omr?.text ?? t('analysis.source.report'))
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
            <button className="knapp" onClick={onVidare} disabled={analys.perKgTs.energi === undefined}>
              {t('analysis.toPlan')}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
