import { useState } from 'react'
import { tolkaProfil } from '../api'
import { RASER, hittaRas } from '../domain/raser'
import { viktFranBrostomfang } from '../domain/slu'
import { INGREDIENSER, type Halsa, type Hastprofil, type Hasttyp, type Kon, type Miljo, type Prestanda, type Produkt } from '../domain/types'
import { HULL_TEXT } from '../format'

const PRESTANDA: [Prestanda, string][] = [
  ['fritid', 'Fritid, ridning och körning'],
  ['tavling_lokal', 'Tävling lokalt, 1–2 gånger i månaden'],
  ['tavling_hog', 'Tävling högre nivå, fälttävlan, svårare hoppning'],
  ['trav_galopp_traning', 'Trav eller galopp i träning'],
  ['distans', 'Distansritt, tävling'],
]

const STANDARD_MILJO: Miljo = { hallning: 'box', timmarUtePerDag: 8, klippt: false, tacke: true, lagstaTempC: -5 }

const TYPER: [Hasttyp, string, string][] = [
  ['lattfodd', 'Lättfödd', 'Ofta ponnyer och kallblodstyper'],
  ['normalfodd', 'Normalfödd', 'Många varmblod och halvblod'],
  ['svarfodd', 'Svårfödd', 'Många fullblod'],
]

const AVSNITT = [
  { id: 'grund', namn: 'Grunduppgifter' },
  { id: 'arbete', namn: 'Arbete' },
  { id: 'miljo', namn: 'Miljö' },
  { id: 'foder', namn: 'Foder i dag' },
  { id: 'halsa', namn: 'Hälsa' },
] as const

export function HorseStep({
  hast,
  produkter,
  onAndra,
  onVidare,
}: {
  hast: Hastprofil
  produkter: Produkt[]
  onAndra: (h: Hastprofil) => void
  onVidare: () => void
}) {
  const set = (patch: Partial<Hastprofil>) => onAndra({ ...hast, ...patch })
  const [matt, setMatt] = useState({ brost: '', langd: '' })
  const uppskattadVikt =
    Number(matt.brost) > 0 && Number(matt.langd) > 0
      ? Math.round(viktFranBrostomfang(Number(matt.brost), Number(matt.langd)))
      : null

  return (
    <div className="profil-layout">
      <nav className="innehall-index" aria-label="Profilens avsnitt">
        {AVSNITT.map((a) => (
          <a key={a.id} href={`#avsnitt-${a.id}`} onClick={(e) => {
            e.preventDefault()
            document.getElementById(`avsnitt-${a.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}>
            {a.namn}
          </a>
        ))}
      </nav>

      <div className="profil">
        <AiHjalp hast={hast} produkter={produkter} onAndra={onAndra} />

        <Del id="grund" rubrik="Grunduppgifter" text="Vikt, hull och typ styr energibehovet mest.">
          <div className="grupp">
            <Falt label="Namn">
              <input value={hast.namn} onChange={(e) => set({ namn: e.target.value })} autoComplete="off" />
            </Falt>
            <Falt label="Ålder (år)">
              <Siffra value={hast.alderAr} onChange={(v) => set({ alderAr: v })} />
            </Falt>
            <Falt label="Kön">
              <select value={hast.kon} onChange={(e) => set({ kon: e.target.value as Kon })}>
                <option value="sto">Sto</option>
                <option value="valack">Valack</option>
                <option value="hingst">Hingst</option>
              </select>
            </Falt>
          </div>
          <Falt label="Ras" hjalp={rasHjalp(hast)}>
            <select
              value={hast.ras ?? ''}
              onChange={(e) => {
                const ras = hittaRas(e.target.value)
                set({ ras: ras?.id, ...(ras ? { typ: ras.typ } : {}) })
              }}
            >
              <option value="">Annan ras eller korsning</option>
              {RASER.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.namn}
                </option>
              ))}
            </select>
          </Falt>
          <Falt label="Typ" hjalp="Sätts av rasen men kan ändras. Påverkar underhållsbehovet med upp till 10 % (SLU tabell 2)." grupp>
            <div className="segment" role="radiogroup" aria-label="Typ">
              {TYPER.map(([id, namn, hjalp]) => (
                <button key={id} role="radio" aria-checked={hast.typ === id} className={hast.typ === id ? 'aktiv' : ''} onClick={() => set({ typ: id })}>
                  {namn}
                  <small>{hjalp}</small>
                </button>
              ))}
            </div>
          </Falt>
          <div className="grupp">
            <Falt label="Vikt (kg)">
              <Siffra value={hast.viktKg} onChange={(v) => set({ viktKg: v })} />
            </Falt>
            <Falt label="Bröstomfång (cm)" hjalp="Om du saknar våg">
              <input inputMode="numeric" value={matt.brost} onChange={(e) => setMatt({ ...matt, brost: e.target.value })} />
            </Falt>
            <Falt label="Längd armbåge till sittben (cm)">
              <input inputMode="numeric" value={matt.langd} onChange={(e) => setMatt({ ...matt, langd: e.target.value })} />
            </Falt>
          </div>
          {uppskattadVikt && (
            <p className="tips">
              Uppskattad vikt {uppskattadVikt} kg enligt SLU:s formel (bröstomfång² × längd / 8900).{' '}
              <button className="lank" onClick={() => set({ viktKg: uppskattadVikt })}>
                Använd {uppskattadVikt} kg
              </button>
            </p>
          )}
          <Falt label={`Hull ${hast.hull}, ${HULL_TEXT[hast.hull].toLowerCase()}`} hjalp="SLU:s skala 1–9. 4–5 passar de flesta hästar.">
            <input type="range" min={1} max={9} value={hast.hull} onChange={(e) => set({ hull: Number(e.target.value) })} />
          </Falt>
        </Del>

        <Del id="arbete" rubrik="Arbete" text="Gren och nivå sätter en lägsta nivå. Ridpassen används om de ger mer.">
          <Falt label="Gren och nivå">
            <select value={hast.prestanda ?? 'fritid'} onChange={(e) => set({ prestanda: e.target.value as Prestanda })}>
              {PRESTANDA.map(([id, text]) => (
                <option key={id} value={id}>
                  {text}
                </option>
              ))}
            </select>
          </Falt>
          <div className="grupp">
            <Falt label="Pass per vecka">
              <Siffra value={hast.ridning?.passPerVecka ?? 0} onChange={(v) => set({ ridning: { ...ridning(hast), passPerVecka: v } })} />
            </Falt>
            <Falt label="Minuter per pass">
              <Siffra value={hast.ridning?.minuterPerPass ?? 0} onChange={(v) => set({ ridning: { ...ridning(hast), minuterPerPass: v } })} />
            </Falt>
            <Falt label="Varav trav och galopp (min)">
              <Siffra value={hast.ridning?.travGaloppMinPerPass ?? 0} onChange={(v) => set({ ridning: { ...ridning(hast), travGaloppMinPerPass: v } })} />
            </Falt>
          </div>
        </Del>

        <Del id="miljo" rubrik="Miljö" text="Oklippta hästar ute utan täcke behöver mer energi när det är kallt.">
          <MiljoSektion miljo={hast.miljo ?? STANDARD_MILJO} onAndra={(miljo) => set({ miljo })} />
        </Del>

        <Del id="foder" rubrik="Foder i dag" text="Det hästen äter nu. Planen jämför med det här.">
          <div className="grupp">
            <Falt label="Grovfoder">
              <select
                value={hast.grovfoder.typ}
                onChange={(e) => set({ grovfoder: { ...hast.grovfoder, typ: e.target.value as 'hosilage' | 'ho' } })}
              >
                <option value="hosilage">Hösilage</option>
                <option value="ho">Hö</option>
              </select>
            </Falt>
            <Falt label="Kg per dag, som det utfodras">
              <Siffra value={hast.grovfoder.kgPerDag} steg={0.5} onChange={(v) => set({ grovfoder: { ...hast.grovfoder, kgPerDag: v } })} />
            </Falt>
          </div>
          <Foderlista hast={hast} produkter={produkter} onAndra={onAndra} />
        </Del>

        <Del id="halsa" rubrik="Hälsa" text="Styr vilka produkter som föreslås och vilka råd planen ger.">
          <HalsaSektion halsa={hast.halsa} onAndra={(halsa) => set({ halsa })} />
          <Falt label="Övrigt">
            <input value={hast.halsa.ovrigt} onChange={(e) => set({ halsa: { ...hast.halsa, ovrigt: e.target.value } })} />
          </Falt>
        </Del>

        <div className="atgardsrad">
          {!hast.namn && <span className="villkor">Ge hästen ett namn för att gå vidare.</span>}
          <button className="knapp" disabled={!hast.namn} onClick={onVidare}>
            Fortsätt till analysen
          </button>
        </div>
      </div>
    </div>
  )
}

function Del({ id, rubrik, text, children }: { id: string; rubrik: string; text: string; children: React.ReactNode }) {
  return (
    <section className="del" id={`avsnitt-${id}`} aria-labelledby={`rubrik-${id}`}>
      <header className="del-huvud">
        <h2 id={`rubrik-${id}`}>{rubrik}</h2>
        <p>{text}</p>
      </header>
      <div className="del-innehall">{children}</div>
    </section>
  )
}

function rasHjalp(h: Hastprofil): string | undefined {
  const ras = hittaRas(h.ras)
  if (!ras?.viktKg) return undefined
  return `Vanlig vikt ${ras.viktKg.min}–${ras.viktKg.max} kg (SLU tabell 33)`
}

function MiljoSektion({ miljo, onAndra }: { miljo: Miljo; onAndra: (m: Miljo) => void }) {
  const set = (patch: Partial<Miljo>) => onAndra({ ...miljo, ...patch })
  return (
    <>
      <div className="grupp">
        <Falt label="Hållning">
          <select value={miljo.hallning} onChange={(e) => set({ hallning: e.target.value as Miljo['hallning'] })}>
            <option value="box">Box med hagvistelse</option>
            <option value="losdrift">Lösdrift</option>
          </select>
        </Falt>
        <Falt label="Timmar ute per dygn">
          <Siffra value={miljo.timmarUtePerDag} onChange={(v) => set({ timmarUtePerDag: v })} />
        </Falt>
        <Falt label="Lägsta temperatur (°C)" hjalp="Kallaste dygnen just nu">
          <Siffra value={miljo.lagstaTempC} onChange={(v) => set({ lagstaTempC: v })} />
        </Falt>
      </div>
      <div className="kryss">
        <label>
          <input type="checkbox" checked={miljo.klippt} onChange={(e) => set({ klippt: e.target.checked })} />
          Klippt
        </label>
        <label>
          <input type="checkbox" checked={miljo.tacke} onChange={(e) => set({ tacke: e.target.checked })} />
          Går med täcke
        </label>
      </div>
    </>
  )
}

const KANSLIGHETER: [keyof Halsa, string][] = [
  ['fang', 'Har haft fång'],
  ['ems', 'EMS eller insulinresistens'],
  ['ppid', 'PPID (Cushings)'],
  ['magsar', 'Magsår'],
  ['pssm', 'Korsförlamning (PSSM)'],
  ['luftvagar', 'Luftvägsbesvär, dammkänslig'],
  ['tandproblem', 'Tandproblem'],
  ['proteinkanslig', 'Proteinkänslig'],
]

function HalsaSektion({ halsa, onAndra }: { halsa: Halsa; onAndra: (h: Halsa) => void }) {
  const undvik = halsa.undvik ?? []
  return (
    <>
      <div className="kryss">
        {KANSLIGHETER.map(([nyckel, text]) => (
          <label key={nyckel}>
            <input
              type="checkbox"
              checked={Boolean(halsa[nyckel])}
              onChange={(e) => onAndra({ ...halsa, [nyckel]: e.target.checked })}
            />
            {text}
          </label>
        ))}
      </div>
      <Falt label="Undvik ingredienser" grupp>
        <div className="chips">
          {INGREDIENSER.map((i) => (
            <button
              key={i}
              type="button"
              className={`chip-val ${undvik.includes(i) ? 'aktiv' : ''}`}
              onClick={() =>
                onAndra({ ...halsa, undvik: undvik.includes(i) ? undvik.filter((x) => x !== i) : [...undvik, i] })
              }
            >
              {i}
            </button>
          ))}
        </div>
      </Falt>
    </>
  )
}

function ridning(h: Hastprofil) {
  return h.ridning ?? { passPerVecka: 0, minuterPerPass: 0, travGaloppMinPerPass: 0 }
}

function Foderlista({ hast, produkter, onAndra }: { hast: Hastprofil; produkter: Produkt[]; onAndra: (h: Hastprofil) => void }) {
  const foder = hast.nuvarandeFoder
  const satt = (i: number, patch: Partial<(typeof foder)[number]>) =>
    onAndra({ ...hast, nuvarandeFoder: foder.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  return (
    <div className="foderlista">
      {/* Sökbar lista: ett namn som matchar en produkt kopplas till den, annars sparas det som eget foder. */}
      <datalist id="produktnamn">
        {produkter.map((p) => (
          <option key={p.id} value={p.namn}>
            {p.butik}
          </option>
        ))}
      </datalist>
      {foder.map((f, i) => (
        <div className="foderrad" key={i}>
          <input
            list="produktnamn"
            placeholder="Sök produkt, till exempel Krafft…"
            value={f.namn}
            className={f.produktId ? '' : 'okand-produkt'}
            title={f.produktId ? undefined : 'Finns inte i produktdatabasen och räknas inte med'}
            onChange={(e) => {
              const p = produkter.find((x) => x.namn === e.target.value)
              satt(i, { produktId: p?.id ?? null, namn: e.target.value })
            }}
          />
          <Siffra value={f.gramPerDag} onChange={(v) => satt(i, { gramPerDag: v })} />
          <span className="enhet">g/dag</span>
          <button
            className="lank"
            onClick={() => onAndra({ ...hast, nuvarandeFoder: foder.filter((_, j) => j !== i) })}
          >
            Ta bort
          </button>
        </div>
      ))}
      <button
        className="lank"
        onClick={() =>
          onAndra({ ...hast, nuvarandeFoder: [...foder, { produktId: null, namn: '', gramPerDag: 100 }] })
        }
      >
        + Lägg till foder
      </button>
    </div>
  )
}

function AiHjalp({ hast, produkter, onAndra }: { hast: Hastprofil; produkter: Produkt[]; onAndra: (h: Hastprofil) => void }) {
  const [foderText, setFoderText] = useState('')
  const [halsaText, setHalsaText] = useState('')
  const [fragor, setFragor] = useState<string[]>([])
  const [svar, setSvar] = useState<Record<string, string>>({})
  const [tidigare, setTidigare] = useState<{ fraga: string; svar: string }[]>([])
  const [laddar, setLaddar] = useState(false)
  const [fel, setFel] = useState<string | null>(null)

  async function kor(extraSvar: { fraga: string; svar: string }[] = []) {
    setLaddar(true)
    setFel(null)
    const allaSvar = [...tidigare, ...extraSvar]
    try {
      const t = await tolkaProfil({
        foderText,
        halsaText,
        tidigareSvar: allaSvar,
        produkter: produkter.map((p) => ({ id: p.id, namn: p.namn })),
      })
      const ras = hittaRas(t.ras ?? undefined)
      const miljo = hast.miljo ?? STANDARD_MILJO
      onAndra({
        ...hast,
        ...(ras ? { ras: ras.id, typ: ras.typ } : {}),
        prestanda: t.prestanda ?? hast.prestanda,
        miljo: {
          ...miljo,
          hallning: t.miljo.hallning ?? miljo.hallning,
          timmarUtePerDag: t.miljo.timmarUtePerDag ?? miljo.timmarUtePerDag,
          klippt: t.miljo.klippt ?? miljo.klippt,
          tacke: t.miljo.tacke ?? miljo.tacke,
        },
        grovfoder: {
          typ: t.grovfoderTyp ?? hast.grovfoder.typ,
          kgPerDag: t.grovfoderKgPerDag ?? hast.grovfoder.kgPerDag,
        },
        nuvarandeFoder: t.nuvarandeFoder.length ? t.nuvarandeFoder : hast.nuvarandeFoder,
        // AI:n kan bara lägga till känsligheter, aldrig ta bort sådana som ägaren kryssat i.
        halsa: {
          ...hast.halsa,
          fang: hast.halsa.fang || t.fang,
          ems: hast.halsa.ems || t.ems,
          ppid: hast.halsa.ppid || t.ppid,
          magsar: hast.halsa.magsar || t.magsar,
          pssm: hast.halsa.pssm || t.pssm,
          luftvagar: hast.halsa.luftvagar || t.luftvagar,
          tandproblem: hast.halsa.tandproblem || t.tandproblem,
          proteinkanslig: hast.halsa.proteinkanslig || t.proteinkanslig,
          undvik: [...new Set([...(hast.halsa.undvik ?? []), ...t.undvik])],
          ovrigt: t.ovrigt || hast.halsa.ovrigt,
        },
      })
      setTidigare(allaSvar)
      setFragor(t.foljdfragor)
      setSvar({})
    } catch (e) {
      setFel(e instanceof Error ? e.message : String(e))
    } finally {
      setLaddar(false)
    }
  }

  return (
    <div className="ai-ruta">
      <div className="ai-rubrik">
        <h2>Beskriv hästen med egna ord</h2>
        <p>Fodr fyller i fälten nedan och frågar om det som saknas. Du kan alltid ändra efteråt.</p>
      </div>
      <Falt label="Om hästen och vad den äter i dag">
        <textarea
          rows={3}
          placeholder="Till exempel: islandshäst på lösdrift, oklippt utan täcke, rids tre gånger i veckan. Två korgar hösilage om dagen och en liter pellets morgon och kväll…"
          value={foderText}
          onChange={(e) => setFoderText(e.target.value)}
        />
      </Falt>
      <Falt label="Hälsa och historik">
        <textarea
          rows={2}
          placeholder="Till exempel: hade fång för två år sedan, inga besvär nu…"
          value={halsaText}
          onChange={(e) => setHalsaText(e.target.value)}
        />
      </Falt>
      <div aria-live="polite">
      {fragor.length > 0 && (
        <div className="foljdfragor">
          {fragor.map((f) => (
            <Falt key={f} label={f}>
              <input value={svar[f] ?? ''} onChange={(e) => setSvar({ ...svar, [f]: e.target.value })} />
            </Falt>
          ))}
        </div>
      )}
      {fel && <p className="fel-rad">{fel}</p>}
      </div>
      <button
        className="knapp sekundar"
        disabled={laddar || (!foderText && !halsaText)}
        onClick={() =>
          kor(fragor.filter((f) => svar[f]).map((f) => ({ fraga: f, svar: svar[f] })))
        }
      >
        {laddar ? 'Fyller i…' : fragor.length ? 'Skicka svaren' : 'Fyll i profilen'}
      </button>
    </div>
  )
}

function Falt({ label, hjalp, grupp, children }: { label: string; hjalp?: string; grupp?: boolean; children: React.ReactNode }) {
  // En knappgrupp får inte ligga i <label>, då aktiverar ett klick på etiketten första knappen.
  const Tag = grupp ? 'div' : 'label'
  return (
    <Tag className="falt">
      <span className="falt-label">{label}</span>
      {children}
      {hjalp && <span className="falt-hjalp">{hjalp}</span>}
    </Tag>
  )
}

function Siffra({ value, onChange, steg = 1 }: { value: number; onChange: (v: number) => void; steg?: number }) {
  return (
    <input
      type="number"
      step={steg}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
    />
  )
}
