import { useMemo } from 'react'
import { byggBoxkort, type Boxkort as BoxkortData } from '../domain/boxkort'
import { kostnadPerManad } from '../domain/intake'
import { skapaPlan } from '../domain/plan'
import type { Hastprofil, Produkt } from '../domain/types'
import type { SparadAnalys } from '../storage'
import { Boxkort } from './Boxkort'

interface Kortdata {
  hast: Hastprofil
  box: number
  kort: BoxkortData | null
  kostnad: number
  fel?: string
}

const idagText = () => new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })

/** Hela stallet: alla hästars boxkort sida vid sida, som stallägaren behöver för att utfodra rätt. */
export function StalletOversikt({
  hastar,
  analyser,
  produkter,
  onOppnaHast,
}: {
  hastar: Hastprofil[]
  analyser: Record<string, SparadAnalys>
  produkter: Produkt[]
  onOppnaHast: (id: string, flik: 'analys' | 'plan') => void
}) {
  const kort = useMemo<Kortdata[]>(
    () =>
      hastar.map((hast, i) => {
        const sparad = analyser[hast.id]
        if (!sparad) return { hast, box: i + 1, kort: null, kostnad: 0 }
        try {
          const plan = skapaPlan({ ...hast, grovfoder: { ...hast.grovfoder, typ: sparad.analys.typ } }, sparad.analys, produkter)
          const poster = [...plan.behallnaFoder, ...(plan.urval?.poster ?? [])]
          return {
            hast,
            box: i + 1,
            kort: byggBoxkort(plan, sparad.analys.typ),
            kostnad: poster.reduce((s, p) => s + kostnadPerManad(p.produkt, p.gramPerDag), 0),
          }
        } catch (e) {
          return { hast, box: i + 1, kort: null, kostnad: 0, fel: e instanceof Error ? e.message : String(e) }
        }
      }),
    [hastar, analyser, produkter],
  )
  const klara = kort.filter((k) => k.kort)
  const total = klara.reduce((s, k) => s + k.kostnad, 0)

  return (
    <div className="oversikt">
      <header className="oversikt-huvud">
        <div>
          <h1>Hela stallet</h1>
          <p className="ingress">
            {klara.length} av {hastar.length} hästar har en foderplan. Tillsammans{' '}
            {Math.round(total).toLocaleString('sv-SE')}&nbsp;kr per månad.
          </p>
        </div>
        {klara.length > 0 && (
          <button className="knapp sekundar" onClick={() => window.print()}>
            Skriv ut alla boxkort
          </button>
        )}
      </header>

      <ul className="oversikt-kort">
        {kort.map((k) => (
          <li key={k.hast.id}>
            {k.kort ? (
              <button className="oversikt-knapp" onClick={() => onOppnaHast(k.hast.id, 'plan')} aria-label={`Öppna foderplanen för ${k.hast.namn}`}>
                <Boxkort namn={k.hast.namn} datum={idagText()} box={k.box} kort={k.kort} kostnadPerManad={k.kostnad} />
              </button>
            ) : (
              <div className="tomt-kort">
                <span className="tomt-namn">{k.hast.namn || 'Ny häst'}</span>
                <span className="liten">Box {k.box}</span>
                <p>{k.fel ?? 'Ingen grovfoderanalys än.'}</p>
                <button className="lank" onClick={() => onOppnaHast(k.hast.id, 'analys')}>
                  Lägg in analysen
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
