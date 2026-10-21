import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BYTESTAKT, type Injustering, type Injusteringsrad } from '@fodr/domain/transition'
import { addDays, localIsoDate, parseIsoDate, tal } from '../format'
import i18n, { locale } from '../i18n'

const VECKODAGAR = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const kortDatum = (d: Date) => d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })

function mangd(r: Injusteringsrad, v: number): string {
  return r.enhet === 'kg' ? i18n.t('units.kg', { value: tal(v, 1) }) : i18n.t('units.g', { value: tal(v, 0) })
}

function andring(r: Injusteringsrad, i: number): { text: string; klass: string } {
  const fore = i === 0 ? r.fran : r.perSteg[i - 1]
  const efter = r.perSteg[i]
  const d = efter - fore
  if (Math.abs(d) < 1e-9) return { text: i18n.t('calendar.change.same'), klass: 'samma' }
  if (fore === 0) return { text: i18n.t('calendar.change.new'), klass: 'upp' }
  if (efter === 0) return { text: i18n.t('calendar.change.end'), klass: 'ner' }
  return { text: `${d > 0 ? '+' : '−'}${mangd(r, Math.abs(d))}`, klass: d > 0 ? 'upp' : 'ner' }
}

export function Injusteringskalender({ injustering, hastNamn }: { injustering: Injustering; hastNamn: string }) {
  const { t } = useTranslation()
  const [start, setStart] = useState(() => localIsoDate(addDays(new Date(), 1)))
  const [valtSteg, setValtSteg] = useState(0)
  const { steg, rader, dagar, kanslighet, forvald } = injustering
  // The date field never stores an empty value (see its onChange), so start is always a real day.
  const startDatum = parseIsoDate(start) ?? addDays(new Date(), 1)
  const takt = BYTESTAKT[kanslighet]
  /** The roughage by its type from the catalogue, a product by its name. */
  const rowName = (r: Injusteringsrad) => (r.enhet === 'kg' ? t(`roughageTitle.${r.grovfodertyp}`) : r.namn)

  // Kalendern börjar på måndagen i startveckan och slutar på söndagen i sista veckan.
  const celler = useMemo(() => {
    const forsta = addDays(startDatum, -((startDatum.getDay() + 6) % 7))
    const sista = addDays(startDatum, dagar - 1)
    const antal = Math.ceil(((sista.getTime() - forsta.getTime()) / 864e5 + 1) / 7) * 7
    return Array.from({ length: antal }, (_, i) => {
      const datum = addDays(forsta, i)
      const dag = Math.round((datum.getTime() - startDatum.getTime()) / 864e5) + 1
      const s = steg.find((x) => x.startDag === dag)
      return { datum, dag, iPerioden: dag >= 1 && dag <= dagar, steg: s, klart: dag === dagar && !s }
    })
    // startDatum härleds ur start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, dagar, steg])

  if (rader.length === 0) {
    return (
      <div className="injustering">
        <h4>{t('calendar.nothingTitle')}</h4>
        <p className="liten">{t('calendar.nothingText')}</p>
      </div>
    )
  }

  const s = steg[valtSteg]
  const stegDatum = (i: number) => addDays(startDatum, steg[i].startDag - 1)

  function laddaNerKalender() {
    const esc = (t: string) =>
      t
        .replace(/\\/g, '\\\\')
        .replace(/[,;]/g, (c) => `\\${c}`)
        .replace(/\n/g, '\\n')
    const ical = (d: Date) => localIsoDate(d).replace(/-/g, '')
    const handelser = steg.map((x, i) => {
      const rad = rader
        .map((r) =>
          t('calendar.ics.row', { name: rowName(r), amount: mangd(r, r.perSteg[i]), change: andring(r, i).text }),
        )
        .join('\n')
      const sista = i === steg.length - 1
      return [
        'BEGIN:VEVENT',
        `UID:fodr-${hastNamn}-${start}-${x.nr}@fodr`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
        `DTSTART;VALUE=DATE:${ical(stegDatum(i))}`,
        `DTEND;VALUE=DATE:${ical(addDays(stegDatum(i), 1))}`,
        `SUMMARY:${esc(sista ? t('calendar.ics.summaryDone', { name: hastNamn }) : t('calendar.ics.summaryStep', { name: hastNamn, step: tal(x.nr, 0), total: tal(steg.length, 0) }))}`,
        `DESCRIPTION:${esc(t('calendar.ics.description', { rows: rad }))}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT6H',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(t('calendar.ics.alarm', { name: hastNamn }))}`,
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n')
    })
    const fil = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fodr//Foderbyte//SV', ...handelser, 'END:VCALENDAR'].join(
      '\r\n',
    )
    const url = URL.createObjectURL(new Blob([fil], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = t('calendar.ics.fileName', { name: hastNamn || t('calendar.ics.fileNameFallback') })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="injustering">
      <div className="injustering-topp">
        <div>
          <h4>{t('calendar.title', { days: tal(dagar, 0) })}</h4>
          <p className="liten">
            {t(`transitionPace.${kanslighet}.name`)}
            {forvald ? t('calendar.preselected') : ''}
            {t('calendar.rhythm', {
              every: takt.dagarPerSteg === 2 ? t('calendar.everyOther') : t('calendar.everyThird'),
              steps: tal(steg.length, 0),
            })}
          </p>
        </div>
        <label className="falt injustering-start">
          <span className="falt-label">{t('calendar.firstDay')}</span>
          <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </label>
      </div>

      <div className="kalender" role="group" aria-label={t('calendar.label')}>
        {VECKODAGAR.map((v) => (
          <span key={v} className="kalender-vd" aria-hidden="true">
            {t(`calendar.weekdays.${v}`)}
          </span>
        ))}
        {celler.map((c) => {
          const i = c.steg ? steg.indexOf(c.steg) : -1
          const klass = [
            'kalender-dag',
            !c.iPerioden && 'utanfor',
            c.steg && 'andra',
            c.klart && 'klart',
            i === valtSteg && 'vald',
          ]
            .filter(Boolean)
            .join(' ')
          const innehall = (
            <>
              <span className="kalender-nr">{c.datum.toLocaleDateString(locale(), { day: 'numeric' })}</span>
              {c.steg && <span className="kalender-tagg">{t('calendar.stepTag', { step: tal(c.steg.nr, 0) })}</span>}
              {c.klart && <span className="kalender-tagg">{t('calendar.done')}</span>}
            </>
          )
          return c.steg ? (
            <button
              key={c.dag}
              type="button"
              className={klass}
              aria-pressed={i === valtSteg}
              aria-label={t('calendar.stepButton', { date: kortDatum(c.datum), step: tal(c.steg.nr, 0) })}
              onClick={() => setValtSteg(i)}
            >
              {innehall}
            </button>
          ) : (
            <span key={c.dag} className={klass}>
              {innehall}
            </span>
          )
        })}
      </div>

      <div className="injustering-steg" aria-live="polite">
        <div className="injustering-steg-rubrik">
          <strong>{t('calendar.stepOf', { step: tal(s.nr, 0), total: tal(steg.length, 0) })}</strong>
          <span className="liten">
            {kortDatum(stegDatum(valtSteg))}
            {s.slutDag ? ` – ${kortDatum(addDays(startDatum, s.slutDag - 1))}` : t('calendar.onwards')}
          </span>
        </div>
        {rader.map((r) => {
          const a = andring(r, valtSteg)
          return (
            <div key={rowName(r)} className="injustering-rad">
              <span>{rowName(r)}</span>
              <strong>{mangd(r, r.perSteg[valtSteg])}</strong>
              <span className={`injustering-andring ${a.klass}`}>{a.text}</span>
            </div>
          )
        })}
        {s.slutDag === null && (
          <p className="liten">{t('calendar.finished', { name: hastNamn || t('common.theHorse') })}</p>
        )}
      </div>

      <details className="bortvalda">
        <summary>{t('calendar.fullSchedule')}</summary>
        <table className="tabell">
          <thead>
            <tr>
              <th>{t('calendar.perDay')}</th>
              <th className="hoger">{t('calendar.today')}</th>
              {steg.map((x, i) => (
                <th key={x.nr} className="hoger">
                  {stegDatum(i).toLocaleDateString(locale(), { day: 'numeric', month: 'numeric' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rader.map((r) => (
              <tr key={rowName(r)}>
                <td>{rowName(r)}</td>
                <td className="hoger">{mangd(r, r.fran)}</td>
                {r.perSteg.map((v, i) => (
                  <td key={i} className="hoger">
                    {mangd(r, v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <div className="ruta varn">
        <p>{t('calendar.warning')}</p>
      </div>

      <button type="button" className="knapp sekundar kompakt" onClick={laddaNerKalender}>
        {t('calendar.download')}
      </button>
    </div>
  )
}
