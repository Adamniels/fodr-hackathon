import type { Boxkort as BoxkortData } from '../domain/boxkort'
import { kortProduktnamn, kr, tal } from '../format'

const NBSP = ' '
const mangd = (v: number, enhet: 'kg' | 'g') => (v > 0 ? `${tal(v, enhet === 'kg' ? 1 : 0)}${NBSP}${enhet}` : '')

/** Kortet på boxdörren: vad hästen ska ha morgon och kväll. Samma kort i appen, på startsidan och i utskrift. */
export function Boxkort({
  namn,
  datum,
  kort,
  kostnadPerManad,
  kostnadIdag,
  box,
  children,
}: {
  namn: string
  datum: string
  kort: BoxkortData
  kostnadPerManad: number
  kostnadIdag?: number
  box?: number
  children?: React.ReactNode
}) {
  return (
    <article className="boxkort" aria-label={`Boxkort för ${namn}`}>
      <header className="boxkort-huvud">
        <span className="boxkort-namn">{namn}</span>
        <span className="boxkort-datum">
          {box !== undefined && <span className="boxkort-box">Box {box}</span>}
          Gäller från {datum}
        </span>
      </header>
      <table className="boxkort-tabell">
        <thead>
          <tr>
            <th scope="col">Foder</th>
            <th scope="col">Morgon</th>
            <th scope="col">Kväll</th>
          </tr>
        </thead>
        <tbody>
          {kort.rader.map((r) => (
            <tr key={r.namn}>
              <th scope="row">{kortProduktnamn(r.namn)}</th>
              <td>{mangd(r.morgon, r.enhet)}</td>
              <td>{mangd(r.kvall, r.enhet)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {kort.borttagna.length > 0 && (
        <p className="boxkort-bort">
          Ges inte längre: {kort.borttagna.map((n, i) => (
            <s key={n}>
              {kortProduktnamn(n)}
              {i < kort.borttagna.length - 1 ? ', ' : ''}
            </s>
          ))}
        </p>
      )}
      <footer className="boxkort-fot">
        <span>
          <strong>{kr(kostnadPerManad)}</strong> per månad
        </span>
        {kostnadIdag !== undefined && kostnadIdag > 0 && <span className="boxkort-idag">I dag {kr(kostnadIdag)}</span>}
      </footer>
      {children}
    </article>
  )
}
