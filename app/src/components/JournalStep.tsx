import { useMemo, useState } from 'react'
import { analyseraJournal, type JournalAnalys } from '../api'
import { beraknaTrend, nyPost, sorteradePoster, type Journalpost, type PlanOgonblick } from '../domain/journal'
import { hittaRas } from '../domain/raser'
import type { Hastprofil } from '../domain/types'
import { HULL_TEXT, kr, tal } from '../format'

interface Props {
  hast: Hastprofil
  poster: Journalpost[]
  aktuellPlan: PlanOgonblick | null
  idag: string
  onLaggTill: (post: Journalpost, uppdateraProfil: boolean) => void
}

export function JournalStep({ hast, poster, aktuellPlan, idag, onLaggTill }: Props) {
  const trend = useMemo(() => beraknaTrend(poster, idag), [poster, idag])
  const tidslinje = useMemo(() => sorteradePoster(poster).reverse(), [poster])

  return (
    <div className="plan">
      <section className="kort">
        <h2>Journal för {hast.namn}</h2>
        <p className="ingress">Väg, hullbedöm och skriv vad som fungerar. Planen räknas om när vikt och hull ändras.</p>
        <div className="trendrad">
          <Trendruta
            rubrik="Vikt"
            varde={trend.vikt ? `${trend.vikt.forsta} → ${trend.vikt.senaste} kg` : '–'}
            under={
              trend.vikt
                ? `${trend.vikt.procentPerVecka > 0 ? '+' : ''}${tal(trend.vikt.procentPerVecka, 2)} % per vecka på ${Math.round(trend.vikt.dagar / 7)} veckor`
                : 'Minst två vägningar behövs'
            }
          />
          <Trendruta
            rubrik="Hull"
            varde={trend.hull ? `${trend.hull.forsta} → ${trend.hull.senaste}` : '–'}
            under={trend.hull ? HULL_TEXT[trend.hull.senaste] : 'Ingen hullbedömning än'}
          />
          <Trendruta
            rubrik="Nästa uppföljning"
            varde={trend.nastaUppfoljning ?? 'Väg nu'}
            under={trend.uppfoljningForfallen ? 'Dags att väga och hullbedöma' : '4 veckor efter senaste mätning'}
            markerad={trend.uppfoljningForfallen || !trend.nastaUppfoljning}
          />
        </div>
        {trend.varningar.map((v) => (
          <div key={v} className="ruta varn">
            {v}
          </div>
        ))}
      </section>

      <div className="kolumner-lika">
        <NyAnteckning hast={hast} idag={idag} onLaggTill={onLaggTill} />
        <AiAnalys hast={hast} poster={poster} trend={trend} aktuellPlan={aktuellPlan} />
      </div>

      <section className="kort">
        <h3>Tidslinje</h3>
        {tidslinje.length === 0 && <p className="liten">Inga anteckningar än.</p>}
        <ol className="tidslinje">
          {tidslinje.map((p) => (
            <li key={p.id}>
              <div className="tid-datum">{p.datum}</div>
              <div className="tid-innehall">
                {(p.viktKg !== undefined || p.hull !== undefined) && (
                  <div className="tid-matt">
                    {p.viktKg !== undefined && <span className="chip okand">{p.viktKg} kg</span>}
                    {p.hull !== undefined && <span className="chip okand">Hull {p.hull}</span>}
                  </div>
                )}
                {p.text && <p>{p.text}</p>}
                {p.plan && (
                  <div className="tid-plan">
                    <strong>Foderplan sparad</strong>
                    <span className="liten">
                      {p.plan.grovfoderKgPerDag} kg grovfoder ({p.plan.analys})
                      {p.plan.produkter.map((x) => ` · ${x.gramPerDag} g ${x.namn}`).join('')} · {kr(p.plan.kostnadPerManad)}/mån
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

function Trendruta({ rubrik, varde, under, markerad }: { rubrik: string; varde: string; under: string; markerad?: boolean }) {
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
  const [datum, setDatum] = useState(idag)
  const [vikt, setVikt] = useState('')
  const [hull, setHull] = useState('')
  const [text, setText] = useState('')
  const [uppdatera, setUppdatera] = useState(true)
  const harMatt = vikt !== '' || hull !== ''

  function spara() {
    onLaggTill(
      nyPost(datum, {
        ...(vikt !== '' ? { viktKg: Number(vikt) } : {}),
        ...(hull !== '' ? { hull: Number(hull) } : {}),
        text: text.trim(),
      }),
      uppdatera && harMatt,
    )
    setVikt('')
    setHull('')
    setText('')
  }

  return (
    <section className="kort">
      <h3>Ny anteckning</h3>
      <div className="grupp">
        <label className="falt">
          <span className="falt-label">Datum</span>
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </label>
        <label className="falt">
          <span className="falt-label">Vikt (kg)</span>
          <input type="number" value={vikt} placeholder={String(hast.viktKg)} onChange={(e) => setVikt(e.target.value)} />
        </label>
        <label className="falt">
          <span className="falt-label">Hull</span>
          <select value={hull} onChange={(e) => setHull(e.target.value)}>
            <option value="">Ej bedömt</option>
            {Object.entries(HULL_TEXT).map(([n, t]) => (
              <option key={n} value={n}>
                {n}, {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="falt">
        <span className="falt-label">Vad har du sett?</span>
        <textarea
          rows={3}
          placeholder="T.ex. piggare sedan bytet, lite lös i magen, öm i hovarna efter grusväg"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {harMatt && (
        <label className="kryss">
          <input type="checkbox" checked={uppdatera} onChange={(e) => setUppdatera(e.target.checked)} />
          Uppdatera profilen och räkna om foderplanen
        </label>
      )}
      <div className="atgardsrad">
        <button className="knapp" disabled={!harMatt && !text.trim()} onClick={spara}>
          Lägg till
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
          trend,
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
        <span className="ai-bricka">AI</span> Vad säger journalen?
      </h3>
      {!svar && !laddar && (
        <p className="liten">AI:n letar mönster över tid och säger till om något bör ses av veterinär. Den ändrar aldrig planen.</p>
      )}
      {fel && <div className="ruta fel">{fel}</div>}
      {svar && (
        <>
          {svar.veterinar.behovs && (
            <div className="ruta varn">
              <strong>Kontakta veterinär.</strong> {svar.veterinar.skal}
            </div>
          )}
          <p>{svar.sammanfattning}</p>
          {svar.monster.length > 0 && (
            <ul className="monster">
              {svar.monster.map((m) => (
                <li key={m.iakttagelse}>
                  {m.datum && <span className="liten">{m.datum}</span>}
                  {m.iakttagelse}
                  {m.mojligKoppling && <span className="liten">Kan hänga ihop med: {m.mojligKoppling}</span>}
                </li>
              ))}
            </ul>
          )}
          {svar.nastaSteg.length > 0 && (
            <>
              <strong>Nästa steg</strong>
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
        <button className="knapp sekundar" disabled={laddar || poster.length === 0} onClick={kor}>
          {laddar ? 'Läser journalen…' : svar ? 'Analysera igen' : 'Analysera journalen'}
        </button>
      </div>
    </section>
  )
}
