import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ANALYSIS_LAB_MAX } from '@fodr/contracts/analyses'
import { validateAnalysis } from '@fodr/domain/validation'
import type { Grovfoderanalys, Grovfodertyp } from '@fodr/domain/types'
import { ApiError } from '../api-v1'
import { parseDecimal } from '../format'
import { domainText } from '../i18n/domain'
import { DecimalInput } from './DecimalInput'

const TYPES: Grovfodertyp[] = ['hosilage', 'ho']

interface Props {
  /** The roughage the horse eats, which the form starts from. */
  grovfodertyp: Grovfodertyp
  /** Stores the analysis; rejects when the server does not. */
  onSave: (analys: Grovfoderanalys) => Promise<void>
  onCancel: () => void
}

/**
 * An analysis typed in by hand, for a report the AI cannot read (#145, CF4). It asks only for what an analysis cannot
 * be without, the roughage type and the dry matter, and the lab and sample date that tell analyses apart; the analysis
 * table takes the nutrients once it is stored, so every value has one place to be typed and checked. Nothing typed
 * there is missing, never 0.
 */
export function ManualAnalysisForm({ grovfodertyp, onSave, onCancel }: Props) {
  const { t } = useTranslation()
  const titleId = useId()
  const typeName = useId()
  const choice = useRef<HTMLInputElement>(null)
  const dryMatter = useRef<HTMLInputElement>(null)
  const [typ, setTyp] = useState(grovfodertyp)
  const [tsProcent, setTsProcent] = useState<number | undefined>()
  const [labb, setLabb] = useState('')
  const [provdatum, setProvdatum] = useState('')
  // Whether saving was tried: a dry matter not given is said only then, not while the form is still being filled in.
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<'failed' | 'horseGone'>()

  // Opened from a link that goes away, so focus starts on the form's first field, at the checked choice as the arrow
  // keys and Tab would.
  useEffect(() => choice.current?.focus(), [])

  const analys: Grovfoderanalys | undefined =
    tsProcent === undefined
      ? undefined
      : {
          typ,
          tsProcent,
          perKgTs: {},
          ...(labb.trim() && { labb: labb.trim() }),
          ...(provdatum && { provdatum }),
        }
  const refused = analys && validateAnalysis(analys).find((e) => e.field === 'tsProcent')
  const dryMatterError = refused ? domainText(refused.message) : tried && !analys ? t('form.required') : undefined

  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setTried(true)
    setFailure(undefined)
    // Text that is no number keeps the last number the field reported (DecimalInput): Enter in it saves nothing.
    const typed = dryMatter.current?.value.trim() ?? ''
    if (!analys || refused || (typed !== '' && parseDecimal(typed) === undefined)) {
      dryMatter.current?.focus()
      return
    }
    setSaving(true)
    try {
      // On success the step shows the stored analysis, and this form goes away.
      await onSave(analys)
    } catch (e) {
      // A horse deleted on another device: trying again cannot help.
      setFailure(e instanceof ApiError && e.code === 'horse.not_found' ? 'horseGone' : 'failed')
      setSaving(false)
    }
  }

  return (
    <form className="manuell" aria-labelledby={titleId} noValidate onSubmit={(e) => void save(e)}>
      <h3 id={titleId}>{t('analysis.manual.title')}</h3>
      <p className="liten">{t('analysis.manual.intro')}</p>
      <fieldset className="falt">
        <legend className="falt-label">{t('analysis.manual.roughage')}</legend>
        <div className="segment">
          {TYPES.map((k) => (
            <label key={k}>
              <input
                ref={k === typ ? choice : undefined}
                type="radio"
                name={typeName}
                checked={typ === k}
                onChange={() => setTyp(k)}
              />
              <span>{t(`roughageTitle.${k}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grupp">
        <label className="falt">
          <span className="falt-label">{t('analysis.manual.dryMatter')}</span>
          <DecimalInput
            ref={dryMatter}
            value={tsProcent}
            error={dryMatterError}
            onChange={setTsProcent}
            onClear={() => setTsProcent(undefined)}
          />
        </label>
        <label className="falt">
          <span className="falt-label">{t('analysis.manual.lab')}</span>
          <input value={labb} maxLength={ANALYSIS_LAB_MAX} onChange={(e) => setLabb(e.target.value)} />
        </label>
        <label className="falt">
          <span className="falt-label">{t('analysis.manual.sampled')}</span>
          <input type="date" value={provdatum} onChange={(e) => setProvdatum(e.target.value)} />
        </label>
      </div>
      {failure && (
        <div className="ruta fel" role="alert">
          {t(`analysis.manual.${failure}`)}
        </div>
      )}
      <div className="atgardsrad">
        <button type="button" className="knapp sekundar" onClick={onCancel}>
          {t('analysis.manual.cancel')}
        </button>
        <button type="submit" className="knapp" disabled={saving}>
          {t('analysis.manual.save')}
        </button>
      </div>
    </form>
  )
}
