import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { analyseraJournal, type JournalAnalys } from '../api'
import { beraknaTrend, nyPost, sorteradePoster, type Journalpost, type PlanOgonblick } from '@fodr/domain/journal'
import { hittaRas } from '@fodr/domain/breeds'
import type { Hastprofil } from '@fodr/domain/types'
import { validateJournalEntry, type JournalField } from '@fodr/domain/validation'
import { HULL_LEVELS, formatDate, hullText, kr, tal } from '../format'
import { domainText } from '../i18n/domain'
import { DecimalInput } from './DecimalInput'

interface Props {
  hast: Hastprofil
  poster: Journalpost[]
  aktuellPlan: PlanOgonblick | null
  idag: string
  onLaggTill: (post: Journalpost, uppdateraProfil: boolean) => void
}

export function JournalStep({ hast, poster, aktuellPlan, idag, onLaggTill }: Props) {
  const { t } = useTranslation()
  const trend = useMemo(() => beraknaTrend(poster, idag), [poster, idag])
  const tidslinje = useMemo(() => sorteradePoster(poster).reverse(), [poster])

  return (
    <div className="plan">
      <section className="kort">
        <h2>{t('journal.title', { name: hast.namn })}</h2>
        <p className="ingress">{t('journal.intro')}</p>
        <div className="trendrad">
          <Trendruta
            rubrik={t('journal.trend.weight')}
            varde={
              trend.vikt
                ? t('journal.trend.weightValue', { first: tal(trend.vikt.forsta, 1), last: tal(trend.vikt.senaste, 1) })
                : '–'
            }
            under={
              trend.vikt
                ? t('journal.trend.weightRate', {
                    sign: trend.vikt.procentPerVecka > 0 ? '+' : '',
                    percent: tal(trend.vikt.procentPerVecka, 2),
                    weeks: tal(trend.vikt.dagar / 7, 0),
                  })
                : t('journal.trend.weightTooFew')
            }
          />
          <Trendruta
            rubrik={t('journal.trend.hull')}
            varde={trend.hull ? `${tal(trend.hull.forsta, 0)} → ${tal(trend.hull.senaste, 0)}` : '–'}
            under={trend.hull ? (hullText(trend.hull.senaste) ?? '') : t('journal.trend.hullNone')}
          />
          <Trendruta
            rubrik={t('journal.trend.followUp')}
            varde={trend.nastaUppfoljning ?? t('journal.trend.weighNow')}
            under={trend.uppfoljningForfallen ? t('journal.trend.followUpDue') : t('journal.trend.followUpRule')}
            markerad={trend.uppfoljningForfallen || !trend.nastaUppfoljning}
          />
        </div>
        {trend.varningar.map(domainText).map((v) => (
          <div key={v} className="ruta varn">
            {v}
          </div>
        ))}
      </section>

      <div className="kolumner-lika">
        {/* Keyed on the horse, like the profile form: switching horse starts a fresh draft and drops the other
            horse's AI analysis, also one still loading (#109). */}
        <NyAnteckning key={`ny-${hast.id}`} hast={hast} idag={idag} onLaggTill={onLaggTill} />
        <AiAnalys key={`ai-${hast.id}`} hast={hast} poster={poster} trend={trend} aktuellPlan={aktuellPlan} />
      </div>

      <section className="kort">
        <h3>{t('journal.timeline')}</h3>
        {tidslinje.length === 0 && <p className="liten">{t('journal.empty')}</p>}
        <ol className="tidslinje">
          {tidslinje.map((p) => (
            <li key={p.id}>
              <div className="tid-datum">{formatDate(p.datum)}</div>
              <div className="tid-innehall">
                {(p.viktKg !== undefined || p.hull !== undefined) && (
                  <div className="tid-matt">
                    {p.viktKg !== undefined && (
                      <span className="chip okand">{t('units.kg', { value: tal(p.viktKg, 1) })}</span>
                    )}
                    {p.hull !== undefined && (
                      <span className="chip okand">{t('journal.hullChip', { hull: tal(p.hull, 0) })}</span>
                    )}
                  </div>
                )}
                {p.text && <p>{p.text}</p>}
                {p.plan && (
                  <div className="tid-plan">
                    <strong>{t('journal.planSaved')}</strong>
                    <span className="liten">
                      {t('journal.planRoughage', { kg: tal(p.plan.grovfoderKgPerDag, 1), analysis: p.plan.analys })}
                      {p.plan.produkter
                        .map((x) => t('journal.planProduct', { grams: tal(x.gramPerDag, 0), name: x.namn }))
                        .join('')}{' '}
                      · {t('units.perMonth', { amount: kr(p.plan.kostnadPerManad) })}
                    </span>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function Trendruta({
  rubrik,
  varde,
  under,
  markerad,
}: {
  rubrik: string
  varde: string
  under: string
  markerad?: boolean
}) {
  return (
    <div className={`trendruta ${markerad ? 'markerad' : ''}`}>
      <span className="liten">{rubrik}</span>
      <strong>{varde}</strong>
      <span className="liten">{under}</span>
    </div>
  )
}

function NyAnteckning({
  hast,
  idag,
  onLaggTill,
}: {
  hast: Hastprofil
  idag: string
  onLaggTill: (post: Journalpost, uppdateraProfil: boolean) => void
}) {
  const { t } = useTranslation()
  // Only a date the owner picks is kept, also after saving (for several back-dated entries in a row); otherwise the
  // entry follows today, also past midnight (#107).
  const [pickedDate, setPickedDate] = useState<string | null>(null)
  const datum = pickedDate ?? idag
  const dateMessageId = useId()
  const [vikt, setVikt] = useState<number | undefined>()
  const [hull, setHull] = useState('')
  const [text, setText] = useState('')
  const [uppdatera, setUppdatera] = useState(true)
  const harMatt = vikt !== undefined || hull !== ''
  const matt = {
    ...(vikt !== undefined ? { viktKg: vikt } : {}),
    ...(hull !== '' ? { hull: Number(hull) } : {}),
  }
  // Checked before saving: an entry can update the profile, so it never stores an empty date or a 0 kg weight.
  const errors = validateJournalEntry({ datum, ...matt })
  const errorFor = (field: JournalField) => {
    const error = errors.find((e) => e.field === field)
    return error && domainText(error.message)
  }

  function spara() {
    onLaggTill(nyPost(datum, { ...matt, text: text.trim() }), uppdatera && harMatt)
    setVikt(undefined)
    setHull('')
    setText('')
  }

  return (
    <section className="kort">
      <h3>{t('journal.newEntry.title')}</h3>
      <div className="grupp">
        <label className="falt">
          <span className="falt-label">{t('journal.newEntry.date')}</span>
          <input
            type="date"
            value={datum}
            aria-invalid={errorFor('datum') ? true : undefined}
            aria-describedby={errorFor('datum') ? dateMessageId : undefined}
            onChange={(e) => setPickedDate(e.target.value)}
          />
          {errorFor('datum') && (
            <span id={dateMessageId} className="falt-fel">
              {errorFor('datum')}
            </span>
          )}
        </label>
        <label className="falt">
          <span className="falt-label">{t('journal.newEntry.weight')}</span>
          <DecimalInput
            value={vikt}
            placeholder={tal(hast.viktKg, 1)}
            error={errorFor('viktKg')}
            onChange={setVikt}
            onClear={() => setVikt(undefined)}
          />
        </label>
        <label className="falt">
          <span className="falt-label">{t('journal.newEntry.hull')}</span>
          <select value={hull} onChange={(e) => setHull(e.target.value)}>
            <option value="">{t('journal.newEntry.hullNone')}</option>
            {HULL_LEVELS.map((n) => (
              <option key={n} value={n}>
                {tal(n, 0)}, {hullText(n)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="falt">
        <span className="falt-label">{t('journal.newEntry.seen')}</span>
        <textarea
          rows={3}
          placeholder={t('journal.newEntry.seenPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {harMatt && (
        <label className="kryss">
          <input type="checkbox" checked={uppdatera} onChange={(e) => setUppdatera(e.target.checked)} />
          {t('journal.newEntry.updateProfile')}
        </label>
      )}
      <div className="atgardsrad">
        <button className="knapp" disabled={(!harMatt && !text.trim()) || errors.length > 0} onClick={spara}>
          {t('journal.newEntry.add')}
        </button>
      </div>
    </section>
  )
}

function AiAnalys({
  hast,
  poster,
  trend,
  aktuellPlan,
}: {
  hast: Hastprofil
  poster: Journalpost[]
  trend: ReturnType<typeof beraknaTrend>
  aktuellPlan: PlanOgonblick | null
}) {
  const { t } = useTranslation()
  const [svar, setSvar] = useState<JournalAnalys | null>(null)
  const [laddar, setLaddar] = useState(false)
  const [fel, setFel] = useState<string | null>(null)

  async function kor() {
    setLaddar(true)
    setFel(null)
    try {
      setSvar(
        await analyseraJournal({
          hast: {
            namn: hast.namn,
            alderAr: hast.alderAr,
            ras: hittaRas(hast.ras)?.namn ?? null,
            viktKg: hast.viktKg,
            hull: hast.hull,
            halsa: hast.halsa,
          },
          poster: sorteradePoster(poster),
          // The model reads the warnings as text, as it did before the engine returned codes (#12).
          trend: { ...trend, varningar: trend.varningar.map(domainText) },
          aktuellPlan,
        }),
      )
    } catch (e) {
      setFel(e instanceof Error ? e.message : String(e))
    } finally {
      setLaddar(false)
    }
  }

  return (
    <section className="kort forklaring">
      <h3>
        <span className="ai-bricka">{t('common.aiBadge')}</span> {t('journal.ai.title')}
      </h3>
      {!svar && !laddar && <p className="liten">{t('journal.ai.intro')}</p>}
      {fel && <div className="ruta fel">{fel}</div>}
      {svar && (
        <>
          {svar.veterinar.behovs && (
            <div className="ruta varn">
              <strong>{t('journal.ai.contactVet')}</strong> {svar.veterinar.skal}
            </div>
          )}
          <p>{svar.sammanfattning}</p>
          {svar.monster.length > 0 && (
            <ul className="monster">
              {svar.monster.map((m) => (
                <li key={m.iakttagelse}>
                  {m.datum && <span className="liten">{formatDate(m.datum)}</span>}
                  {m.iakttagelse}
                  {m.mojligKoppling && (
                    <span className="liten">{t('journal.ai.possibleLink', { link: m.mojligKoppling })}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {svar.nastaSteg.length > 0 && (
            <>
              <strong>{t('journal.ai.nextSteps')}</strong>
              <ol className="atgarder">
                {svar.nastaSteg.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
      <div className="atgardsrad">
        <button className="knapp sekundar" disabled={laddar || poster.length === 0} onClick={() => void kor()}>
          {laddar ? t('journal.ai.reading') : svar ? t('journal.ai.again') : t('journal.ai.analyse')}
        </button>
      </div>
    </section>
  )
}
