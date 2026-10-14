import { useState } from 'react'
import { filTillBase64, lasAnalys } from '../api'
import { analysBas, analysKomplett } from '../data/exempel'
import { tillGrovfoderanalys, type Omrakning } from '../domain/analysis'
import { schablonFor } from '../domain/forage'
import type { NutrientKey } from '../domain/nutrients'
import type { Grovfoderanalys, Hastprofil } from '../domain/types'
import { analysEnhet, etikett } from '../format'

interface Props {
  hast: Hastprofil
  analys: Grovfoderanalys | null
  omrakningar: Omrakning[]
  onAnalys: (a: Grovfoderanalys, o: Omrakning[]) => void
  onVidare: () => void
}

const VISADE: NutrientKey[] = [
  'energi', 'smbRp', 'socker', 'starkelse', 'ca', 'p', 'mg', 'na', 'fe', 'mn', 'cu', 'zn', 'co', 'jod', 'se',
]

export function AnalysisStep({ hast, analys, omrakningar, onAnalys, onVidare }: Props) {
  const [laddar, setLaddar] = useState(false)
  const [fel, setFel] = useState<string | null>(null)
  const [anmarkningar, setAnmarkningar] = useState<string[]>([])
  const [filnamn, setFilnamn] = useState<string | null>(null)
  const [draOver, setDraOver] = useState(false)

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
        <button className="lank" onClick={() => onAnalys(analysKomplett, [])}>
          Använd en exempelanalys
        </button>{' '}
        eller{' '}
        <button className="lank" onClick={() => onAnalys(analysBas, [])}>
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
        <>
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
          <div className="atgardsrad">
            {analys.perKgTs.energi === undefined && (
              <span className="villkor">Energin saknas. Fyll i den för att räkna fram en plan.</span>
            )}
            <button className="knapp" onClick={onVidare} disabled={analys.perKgTs.energi === undefined}>
              Visa foderplanen
            </button>
          </div>
        </>
      )}
    </section>
  )
}
