import { useMemo, useState } from 'react'
import { BYTESTAKT, type Injustering, type Injusteringsrad } from '../domain/injustering'
import { tal } from '../format'

const VECKODAGAR = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön']

const plusDagar = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const isoDag = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const franIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const kortDatum = (d: Date) => d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })

function mangd(r: Injusteringsrad, v: number): string {
  return r.enhet === 'kg' ? `${tal(v, 1)} kg` : `${tal(v, 0)} g`
}

function andring(r: Injusteringsrad, i: number): { text: string; klass: string } {
  const fore = i === 0 ? r.fran : r.perSteg[i - 1]
  const efter = r.perSteg[i]
  const d = efter - fore
  if (Math.abs(d) < 1e-9) return { text: 'samma', klass: 'samma' }
  if (fore === 0) return { text: 'ny', klass: 'upp' }
  if (efter === 0) return { text: 'slut', klass: 'ner' }
  return { text: `${d > 0 ? '+' : '−'}${mangd(r, Math.abs(d))}`, klass: d > 0 ? 'upp' : 'ner' }
}

export function Injusteringskalender({ injustering, hastNamn }: { injustering: Injustering; hastNamn: string }) {
  const [start, setStart] = useState(() => isoDag(plusDagar(new Date(), 1)))
  const [valtSteg, setValtSteg] = useState(0)
  const { steg, rader, dagar, kanslighet, forvald } = injustering
  const startDatum = franIso(start)
  const takt = BYTESTAKT[kanslighet]

  // Kalendern börjar på måndagen i startveckan och slutar på söndagen i sista veckan.
  const celler = useMemo(() => {
    const forsta = plusDagar(startDatum, -((startDatum.getDay() + 6) % 7))
    const sista = plusDagar(startDatum, dagar - 1)
    const antal = Math.ceil(((sista.getTime() - forsta.getTime()) / 864e5 + 1) / 7) * 7
    return Array.from({ length: antal }, (_, i) => {
      const datum = plusDagar(forsta, i)
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
        <h4>Inget att trappa in</h4>
        <p className="liten">Planen ändrar inga mängder, så du kan börja direkt.</p>
      </div>
    )
  }

  const s = steg[valtSteg]
  const stegDatum = (i: number) => plusDagar(startDatum, steg[i].startDag - 1)

  function laddaNerKalender() {
    const esc = (t: string) =>
      t
        .replace(/\\/g, '\\\\')
        .replace(/[,;]/g, (c) => `\\${c}`)
        .replace(/\n/g, '\\n')
    const ical = (d: Date) => isoDag(d).replace(/-/g, '')
    const handelser = steg.map((x, i) => {
      const rad = rader.map((r) => `${r.namn}: ${mangd(r, r.perSteg[i])} per dag (${andring(r, i).text})`).join('\n')
      const sista = i === steg.length - 1
      return [
        'BEGIN:VEVENT',
        `UID:fodr-${hastNamn}-${start}-${x.nr}@fodr`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
        `DTSTART;VALUE=DATE:${ical(stegDatum(i))}`,
        `DTEND;VALUE=DATE:${ical(plusDagar(stegDatum(i), 1))}`,
        `SUMMARY:${esc(`Fodr: ${hastNamn}, ${sista ? 'ny foderstat klar' : `foderbyte steg ${x.nr} av ${steg.length}`}`)}`,
        `DESCRIPTION:${esc(`Ändra måtten från i dag:\n${rad}`)}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT6H',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(`I morgon ändras ${hastNamn}s foder`)}`,
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
    a.download = `foderbyte-${hastNamn || 'hast'}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="injustering">
      <div className="injustering-topp">
        <div>
          <h4>Byt över på {dagar} dagar</h4>
          <p className="liten">
            {takt.namn}
            {forvald ? ' (förvalt utifrån hälsan)' : ''}: måtten ändras var{' '}
            {takt.dagarPerSteg === 2 ? 'annan' : 'tredje'} dag i {steg.length} steg. Ändra känsligheten under Hästen.
          </p>
        </div>
        <label className="falt injustering-start">
          <span className="falt-label">Första dagen</span>
          <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </label>
      </div>

      <div className="kalender" role="group" aria-label="Kalender för foderbytet">
        {VECKODAGAR.map((v) => (
          <span key={v} className="kalender-vd" aria-hidden="true">
            {v}
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
              <span className="kalender-nr">{c.datum.getDate()}</span>
              {c.steg && <span className="kalender-tagg">Steg {c.steg.nr}</span>}
              {c.klart && <span className="kalender-tagg">Klart</span>}
            </>
          )
          return c.steg ? (
            <button
              key={c.dag}
              type="button"
              className={klass}
              aria-pressed={i === valtSteg}
              aria-label={`${kortDatum(c.datum)}, steg ${c.steg.nr}: ändra måtten`}
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
          <strong>
            Steg {s.nr} av {steg.length}
          </strong>
          <span className="liten">
            {kortDatum(stegDatum(valtSteg))}
            {s.slutDag ? ` – ${kortDatum(plusDagar(startDatum, s.slutDag - 1))}` : ' och framåt'}
          </span>
        </div>
        {rader.map((r) => {
          const a = andring(r, valtSteg)
          return (
            <div key={r.namn} className="injustering-rad">
              <span>{r.namn}</span>
              <strong>{mangd(r, r.perSteg[valtSteg])}</strong>
              <span className={`injustering-andring ${a.klass}`}>{a.text}</span>
            </div>
          )
        })}
        {s.slutDag === null && <p className="liten">Nu är {hastNamn || 'hästen'} på den nya foderstaten.</p>}
      </div>

      <details className="bortvalda">
        <summary>Hela schemat</summary>
        <table className="tabell">
          <thead>
            <tr>
              <th>Per dag</th>
              <th className="hoger">I dag</th>
              {steg.map((x, i) => (
                <th key={x.nr} className="hoger">
                  {stegDatum(i).toLocaleDateString('sv-SE', { day: 'numeric', month: 'numeric' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rader.map((r) => (
              <tr key={r.namn}>
                <td>{r.namn}</td>
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
        <p>
          Blir avföringen lös eller aptiten sämre: stanna kvar på samma steg 2–3 dagar innan du går vidare. Ömma hovar,
          värme i hovarna eller ovilja att gå: kontakta veterinär direkt.
        </p>
      </div>

      <button type="button" className="knapp sekundar kompakt" onClick={laddaNerKalender}>
        Lägg in i min kalender
      </button>
    </div>
  )
}
