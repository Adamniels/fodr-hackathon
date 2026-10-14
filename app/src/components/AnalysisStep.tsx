import { useState } from 'react'
import { filTillBase64, lasAnalys } from '../api'
import { analysBas, analysKomplett } from '../data/exempel'
import { tillGrovfoderanalys, type Omrakning } from '../domain/analysis'
import { schablonFor } from '../domain/forage'
import type { NutrientKey } from '../domain/nutrients'
import type { Grovfoderanalys, Hastprofil } from '../domain/types'
import { bedomGrovfoder } from '../domain/kvalitet'
import { jamforMedSverige, type Jamforelse } from '../domain/sverige'
import { analysEnhet, etikett, tal } from '../format'

export interface Forhandsvisning {
  url: string
  typ: 'pdf' | 'bild'
  namn: string
}

interface Props {
  hast: Hastprofil
  analys: Grovfoderanalys | null
  omrakningar: Omrakning[]
  onAnalys: (a: Grovfoderanalys, o: Omrakning[]) => void
  onVidare: () => void
  forhandsvisning: Forhandsvisning | null
  onForhandsvisning: (f: Forhandsvisning | null) => void
}

const EXEMPEL_KOMPLETT: Forhandsvisning = { url: '/exempel/A01-medel-skord1.pdf', typ: 'pdf', namn: 'A01-medel-skord1.pdf' }
const EXEMPEL_BAS: Forhandsvisning = { url: '/exempel/A05-bas-utan-mineraler.pdf', typ: 'pdf', namn: 'A05-bas-utan-mineraler.pdf' }

const VISADE: NutrientKey[] = [
  'energi', 'smbRp', 'socker', 'starkelse', 'ca', 'p', 'mg', 'na', 'fe', 'mn', 'cu', 'zn', 'co', 'jod', 'se',
]

export function AnalysisStep({ hast, analys, omrakningar, onAnalys, onVidare, forhandsvisning, onForhandsvisning }: Props) {
  const [laddar, setLaddar] = useState(false)
  const [fel, setFel] = useState<string | null>(null)
  const [anmarkningar, setAnmarkningar] = useState<string[]>([])
  const [filnamn, setFilnamn] = useState<string | null>(null)
  const [draOver, setDraOver] = useState(false)

  async function laddaUpp(fil: File) {
    setLaddar(true)
    setFel(null)
    setFilnamn(fil.name)
    onForhandsvisning({ url: URL.createObjectURL(fil), typ: fil.type === 'application/pdf' ? 'pdf' : 'bild', namn: fil.name })
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
    onAnalys({ ...analys, perKgTs }, omrakningar.filter((o) => o.amne !== k))
  }

  return (
    <section className="analys-sida">
      <p className="ingress">
        Ladda upp analysen av {hast.namn}s grovfoder. Fodr läser av värdena, och du ser allt som lästes ut och kan rätta det.
      </p>

      <label
        className={`uppladdning ${laddar ? 'laddar' : ''} ${draOver ? 'dra-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDraOver(true)
        }}
        onDragLeave={() => setDraOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDraOver(false)
          const fil = e.dataTransfer.files?.[0]
          if (fil && !laddar) laddaUpp(fil)
        }}
      >
        <input
          className="visuellt-dold"
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          onChange={(e) => e.target.files?.[0] && laddaUpp(e.target.files[0])}
          disabled={laddar}
        />
        <span aria-live="polite">
          {laddar ? (
            <>Läser {filnamn}…</>
          ) : (
            <>
              <strong>Välj analysrapport</strong> eller släpp filen här
              <small>PDF eller foto, från vilket labb som helst</small>
            </>
          )}
        </span>
      </label>
      <p className="exempel">
        Har du ingen analys till hands?{' '}
        <button className="lank" onClick={() => {
            onAnalys(analysKomplett, [])
            onForhandsvisning(EXEMPEL_KOMPLETT)
          }}>
          Använd en exempelanalys
        </button>{' '}
        eller{' '}
        <button className="lank" onClick={() => {
            onAnalys(analysBas, [])
            onForhandsvisning(EXEMPEL_BAS)
          }}>
          en basanalys utan mineraler
        </button>
        .
      </p>
      {fel && (
        <p className="fel-rad" role="alert">
          {fel}
        </p>
      )}

      {analys && (
        <div className={`analys-granskning ${forhandsvisning ? 'med-kalla' : ''}`}>
          {forhandsvisning && (
            <figure className="kalla-rapport">
              {forhandsvisning.typ === 'pdf' ? (
                <iframe src={`${forhandsvisning.url}#toolbar=0&navpanes=0&view=FitH`} title={`Analysrapport ${forhandsvisning.namn}`} />
              ) : (
                <img src={forhandsvisning.url} alt={`Analysrapport ${forhandsvisning.namn}`} />
              )}
              <figcaption>{forhandsvisning.namn}</figcaption>
            </figure>
          )}
          <div className="analys-varden">
          <h2 className="analys-rubrik">Utlästa värden</h2>
          <p className="del-ingress">Jämför med rapporten och rätta om något blev fel.</p>
          <div className="analyshuvud">
            <span>{analys.typ === 'hosilage' ? 'Hösilage' : 'Hö'}</span>
            {analys.labb && <span>{analys.labb}</span>}
            {analys.provdatum && <span>Prov {analys.provdatum}</span>}
            <label>
              Torrsubstans{' '}
              <input
                className="smal"
                type="number"
                value={analys.tsProcent}
                onChange={(e) => onAnalys({ ...analys, tsProcent: Number(e.target.value) }, omrakningar)}
              />{' '}
              %
            </label>
            <label>
              Aska{' '}
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
              g/kg ts
            </label>
          </div>
          <table className="tabell">
            <thead>
              <tr>
                <th>Ämne</th>
                <th>Värde</th>
                <th>Enhet</th>
                <th>Källa</th>
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
                        aria-label={`${etikett(k)}, ${analysEnhet(k)}`}
                        className="smal"
                        value={v ?? ''}
                        placeholder="–"
                        onChange={(e) => andra(k, e.target.value)}
                      />
                    </td>
                    <td className="enhet">{analysEnhet(k)}</td>
                    <td className="kalla">
                      {v !== undefined
                        ? omr?.text ?? 'Analysen'
                        : schablon
                          ? `Saknas, uppskattas (${schablon.kalla})`
                          : 'Saknas'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {anmarkningar.length > 0 && (
            <div className="ruta varn">
              <strong>Att kontrollera:</strong>
              <ul>
                {anmarkningar.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <Kvalitet analys={analys} hast={hast} />
          <SverigeJamforelse analys={analys} />
          <div className="atgardsrad">
            {analys.perKgTs.energi === undefined && (
              <span className="villkor">Energin saknas. Fyll i den för att räkna fram en plan.</span>
            )}
            <button className="knapp" onClick={onVidare} disabled={analys.perKgTs.energi === undefined}>
              Visa foderplanen
            </button>
          </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Kvalitet({ analys, hast }: { analys: Grovfoderanalys; hast: Hastprofil }) {
  const flaggor = bedomGrovfoder(analys, hast)
  if (flaggor.length === 0) return null
  return (
    <section className="analys-del" aria-labelledby="kvalitet-rubrik">
      <h2 id="kvalitet-rubrik" className="analys-rubrik">Om grovfodret</h2>
      <ul className="noter">
        {flaggor.map((f) => (
          <li key={f.rubrik} className={f.niva}>
            <strong>{f.rubrik}.</strong> {f.text} <span className="kalla-text">{f.kalla}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SverigeJamforelse({ analys }: { analys: Grovfoderanalys }) {
  const { grupp, n, rader } = jamforMedSverige(analys)
  if (rader.length === 0) return null
  return (
    <section className="analys-del" aria-labelledby="sverige-rubrik">
      <h2 id="sverige-rubrik" className="analys-rubrik">Jämfört med Sverige</h2>
      <p className="del-ingress">
        Det grå bandet är där 80 % av Sveriges analyser hamnar ({grupp.toLowerCase()}, {n.toLocaleString('sv-SE')} analyser,
        skördeår 2026). Strecket är medel och punkten ditt foder.
      </p>
      <ul className="sverige">
        {rader.map((r) => (
          <Sverigerad key={r.nyckel} r={r} />
        ))}
      </ul>
      <p className="liten">Källa: Växa, foderstatistik skördeår 2026. Energi och protein för häst är uppskattade ur statistiken.</p>
    </section>
  )
}

function Sverigerad({ r }: { r: Jamforelse }) {
  // Skalan går från hälften av P10 till 1,5 gånger P90, så att avvikande värden syns men inte trycker ihop bandet.
  const min = Math.min(r.p10 * 0.5, r.varde)
  const max = Math.max(r.p90 * 1.5, r.varde)
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`
  const lageText = r.lage === 'lag' ? 'Lågt' : r.lage === 'hog' ? 'Högt' : 'Normalt'
  return (
    <li className={`sverige-rad ${r.lage}`}>
      <span className="sverige-namn">
        {r.etikett}
        {r.approximerad && <span className="kalla-text"> uppskattat</span>}
      </span>
      <span className="sverige-varde">
        {tal(r.varde)} {r.enhet} <span className="sverige-lage">{lageText}</span>
      </span>
      <span className="sverige-spar" role="img" aria-label={`${lageText}: ${tal(r.varde)} ${r.enhet}, normalt ${tal(r.p10)} till ${tal(r.p90)}`}>
        <span className="sverige-band" style={{ left: pos(r.p10), width: `calc(${pos(r.p90)} - ${pos(r.p10)})` }} />
        <span className="sverige-medel" style={{ left: pos(r.medel) }} />
        <span className="sverige-punkt" style={{ left: pos(r.varde) }} />
      </span>
    </li>
  )
}
