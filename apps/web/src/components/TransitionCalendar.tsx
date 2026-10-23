import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BYTESTAKT, type Injustering, type Injusteringsrad } from '@fodr/domain/transition'
import { addDays, localIsoDate, parseIsoDate, formatNumber } from '../format'
import i18n, { locale } from '../i18n'
import { TableScroll } from './TableScroll'

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const shortDate = (d: Date) => d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })

function amountText(r: Injusteringsrad, v: number): string {
  return r.enhet === 'kg'
    ? i18n.t('units.kg', { value: formatNumber(v, 1) })
    : i18n.t('units.g', { value: formatNumber(v, 0) })
}

function changeText(r: Injusteringsrad, i: number): { text: string; klass: string } {
  const fore = i === 0 ? r.fran : r.perSteg[i - 1]
  const efter = r.perSteg[i]
  const d = efter - fore
  if (Math.abs(d) < 1e-9) return { text: i18n.t('calendar.change.same'), klass: 'samma' }
  if (fore === 0) return { text: i18n.t('calendar.change.new'), klass: 'upp' }
  if (efter === 0) return { text: i18n.t('calendar.change.end'), klass: 'ner' }
  return { text: `${d > 0 ? '+' : '−'}${amountText(r, Math.abs(d))}`, klass: d > 0 ? 'upp' : 'ner' }
}

export function TransitionCalendar({ injustering, hastNamn }: { injustering: Injustering; hastNamn: string }) {
  const { t } = useTranslation()
  const [start, setStart] = useState(() => localIsoDate(addDays(new Date(), 1)))
  const [valtSteg, setValtSteg] = useState(0)
  const { steg, rader, dagar, kanslighet, forvald } = injustering
  // Defensive (#109): nothing changes the plan while the calendar is shown (other steps unmount it, and a horse switch
  // remounts it), but a selection past the last step would crash the render. skapaInjustering always gives a step.
  const visatSteg = Math.min(valtSteg, steg.length - 1)
  // The date field never stores an empty value (see its onChange), so start is always a real day.
  const startDatum = parseIsoDate(start) ?? addDays(new Date(), 1)
  const takt = BYTESTAKT[kanslighet]
  /** The roughage by its type from the catalogue, a product by its name. */
  const rowName = (r: Injusteringsrad) => (r.enhet === 'kg' ? t(`roughageTitle.${r.grovfodertyp}`) : r.namn)

  // The calendar starts on the Monday of the start week and ends on the Sunday of the last week.
  const celler = useMemo(() => {
    const forsta = addDays(startDatum, -((startDatum.getDay() + 6) % 7))
    const sista = addDays(startDatum, dagar - 1)
    // Calendar days, rounded like dag below: a day can have 23 or 25 hours at a clock change (#106).
    const dagarIRutnatet = Math.round((sista.getTime() - forsta.getTime()) / 864e5) + 1
    const antal = Math.ceil(dagarIRutnatet / 7) * 7
    return Array.from({ length: antal }, (_, i) => {
      const datum = addDays(forsta, i)
      const dag = Math.round((datum.getTime() - startDatum.getTime()) / 864e5) + 1
      const s = steg.find((x) => x.startDag === dag)
      return { datum, dag, iPerioden: dag >= 1 && dag <= dagar, steg: s, klart: dag === dagar && !s }
    })
    // startDatum is derived from start
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

  const s = steg[visatSteg]
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
          t('calendar.ics.row', {
            name: rowName(r),
            amount: amountText(r, r.perSteg[i]),
            change: changeText(r, i).text,
          }),
        )
        .join('\n')
      const sista = i === steg.length - 1
      return [
        'BEGIN:VEVENT',
        `UID:fodr-${hastNamn}-${start}-${x.nr}@fodr`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
        `DTSTART;VALUE=DATE:${ical(stegDatum(i))}`,
        `DTEND;VALUE=DATE:${ical(addDays(stegDatum(i), 1))}`,
        `SUMMARY:${esc(sista ? t('calendar.ics.summaryDone', { name: hastNamn }) : t('calendar.ics.summaryStep', { name: hastNamn, step: formatNumber(x.nr, 0), total: formatNumber(steg.length, 0) }))}`,
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
          <h4>{t('calendar.title', { days: formatNumber(dagar, 0) })}</h4>
          <p className="liten">
            {t(`transitionPace.${kanslighet}.name`)}
            {forvald ? t('calendar.preselected') : ''}
            {t('calendar.rhythm', {
              every: takt.dagarPerSteg === 2 ? t('calendar.everyOther') : t('calendar.everyThird'),
              steps: formatNumber(steg.length, 0),
            })}
          </p>
        </div>
        <label className="falt injustering-start">
          <span className="falt-label">{t('calendar.firstDay')}</span>
          <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </label>
      </div>

      <div className="kalender" role="group" aria-label={t('calendar.label')}>
        {WEEKDAYS.map((v) => (
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
            i === visatSteg && 'vald',
          ]
            .filter(Boolean)
            .join(' ')
          const innehall = (
            <>
              <span className="kalender-nr">{c.datum.toLocaleDateString(locale(), { day: 'numeric' })}</span>
              {c.steg && (
                <span className="kalender-tagg">{t('calendar.stepTag', { step: formatNumber(c.steg.nr, 0) })}</span>
              )}
              {c.klart && <span className="kalender-tagg">{t('calendar.done')}</span>}
            </>
          )
          return c.steg ? (
            <button
              key={c.dag}
              type="button"
              className={klass}
              aria-pressed={i === visatSteg}
              aria-label={t('calendar.stepButton', { date: shortDate(c.datum), step: formatNumber(c.steg.nr, 0) })}
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
          <strong>{t('calendar.stepOf', { step: formatNumber(s.nr, 0), total: formatNumber(steg.length, 0) })}</strong>
          <span className="liten">
            {shortDate(stegDatum(visatSteg))}
            {s.slutDag ? ` – ${shortDate(addDays(startDatum, s.slutDag - 1))}` : t('calendar.onwards')}
          </span>
        </div>
        {rader.map((r) => {
          const a = changeText(r, visatSteg)
          return (
            <div key={rowName(r)} className="injustering-rad">
              <span>{rowName(r)}</span>
              <strong>{amountText(r, r.perSteg[visatSteg])}</strong>
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
        <TableScroll label={t('calendar.fullSchedule')}>
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
                  <td className="hoger">{amountText(r, r.fran)}</td>
                  {r.perSteg.map((v, i) => (
                    <td key={i} className="hoger">
                      {amountText(r, v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
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
