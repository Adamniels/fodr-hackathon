import { HULL_TEXT } from '../format'

// Hästen sedd bakifrån, som i hullbedömning. Låga poäng: spetsig ryggrad och smalt kors.
// Höga poäng: bredare kors med fett på båda sidor och en ränna längs ryggen (SLU tabell 1).
function bakifran(s: number): string {
  const cx = 32
  const w = Math.min(12 + s * 2, 30)
  const yH = 18 - (s - 1) * 0.4
  const ut = (x: number) => x.toFixed(1)
  let mitt: string
  if (s < 5) {
    // Insjunken flank mellan höftknöl och ryggrad, djupare ju magrare.
    const topp = yH - (5 - s) * 3
    const sank = yH + (5 - s) * 2.2
    mitt = `Q ${ut(cx - w * 0.3)} ${ut(sank)}, ${ut(cx - 3)} ${ut(topp + 3)} L ${cx} ${ut(topp)} L ${ut(cx + 3)} ${ut(topp + 3)} Q ${ut(cx + w * 0.3)} ${ut(sank)},`
  } else {
    const ranna = s > 5 ? (s - 5) * 1.4 : 0
    const bula = s > 5 ? (s - 5) * 1.5 : 1.5
    const ry = yH - bula + ranna
    mitt = `C ${ut(cx - w * 0.3)} ${ut(yH - bula * 1.6)}, ${ut(cx - 4)} ${ut(ry)}, ${cx} ${ut(ry)} C ${ut(cx + 4)} ${ut(ry)}, ${ut(cx + w * 0.3)} ${ut(yH - bula * 1.6)}`
  }
  return [
    `M ${ut(cx - w)} 46`,
    `C ${ut(cx - w)} 32, ${ut(cx - w * 0.9)} ${ut(yH)}, ${ut(cx - w * 0.55)} ${ut(yH)}`,
    mitt,
    `${ut(cx + w * 0.55)} ${ut(yH)}`,
    `C ${ut(cx + w * 0.9)} ${ut(yH)}, ${ut(cx + w)} 32, ${ut(cx + w)} 46 Z`,
  ]
    .join(' ')
    .replace(/ {2,}/g, ' ')
}

export function Hullskala({ varde, onAndra }: { varde: number; onAndra: (v: number) => void }) {
  return (
    <div className="hullskala">
      <div className="hull-val" role="radiogroup" aria-label="Hull, sett bakifrån">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={varde === s}
            aria-label={`${s}, ${HULL_TEXT[s]}`}
            className={`hull-knapp ${varde === s ? 'vald' : ''}`}
            onClick={() => onAndra(s)}
          >
            <svg viewBox="0 0 64 48" aria-hidden="true">
              <path d={bakifran(s)} />
            </svg>
            <span>{s}</span>
          </button>
        ))}
      </div>
      <p className="hull-text">
        <strong>
          {varde}, {HULL_TEXT[varde].toLowerCase()}.
        </strong>{' '}
        {varde <= 3 ? 'Ryggrad och höftknölar syns.' : varde <= 5 ? 'Jämn rygg, revbenen känns men syns inte.' : 'Ränna längs ryggen och fett runt svansroten.'}{' '}
        4–5 passar de flesta hästar.
      </p>
    </div>
  )
}
