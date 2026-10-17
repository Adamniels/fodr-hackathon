import { useMemo } from 'react'
import { analysKomplett, demoHast } from '../data/exempel'
import { kostnadPerManad } from '@fodr/domain/intake'
import { skapaPlan } from '@fodr/domain/plan'
import type { Produkt } from '@fodr/domain/types'
import { kr, tal } from '../format'
import { Ordmarke } from './Varumarke'

interface Props {
  produkter: Produkt[]
  inloggadSom: string | null
  onDemo: () => void
  onLoggaIn: () => void
}

/** Marknadssidan: Notions upplägg (vit yta, tydlig rubrik, produktbild) med Wildlife-känsla (foton, serif, skogsgrönt). */
export function Startsida({ produkter, inloggadSom, onDemo, onLoggaIn }: Props) {
  return (
    <div className="start">
      <header className="start-meny">
        <div className="start-meny-inre">
          <Ordmarke />
          <nav className="start-lankar" aria-label="Startsidan">
            <a href="#sa-funkar">Så funkar det</a>
            <a href="#trovardigt">Hur vi räknar</a>
            <a href="#fragor">Vanliga frågor</a>
          </nav>
          <div className="start-meny-hoger">
            {!inloggadSom && (
              <button className="knapp text" onClick={onLoggaIn}>
                Logga in
              </button>
            )}
            <button className="knapp kompakt" onClick={onDemo}>
              {inloggadSom ? 'Öppna Fodr' : 'Testa med demohästen'}
            </button>
          </div>
        </div>
      </header>

      <section className="start-hero">
        <p className="overrubrik">För dig som har häst och en grovfoderanalys</p>
        <h1>
          Rätt foder till din häst, direkt från <span className="markering">analysen</span>
        </h1>
        <p className="start-ingress">
          Ladda upp analysen från labbet, berätta om hästen och få en foderplan enligt SLU. Med vad du ska ge, hur
          mycket och vad det kostar per månad.
        </p>
        <div className="start-knappar">
          <button className="knapp stor" onClick={onDemo}>
            {inloggadSom ? `Fortsätt som ${inloggadSom}` : 'Testa med demohästen'}
          </button>
          <a className="knapp stor sekundar" href="#sa-funkar">
            Se hur det funkar
          </a>
        </div>
        <p className="start-not">Inget konto behövs för att testa. Fungerar med PDF eller ett foto av rapporten.</p>
        <Produktbild produkter={produkter} />
      </section>

      <p className="kallrad">
        Beräkningarna följer <strong>SLU:s utfodringsrekommendationer för häst</strong>. Fodr är inte knutet till någon
        foderbutik.
      </p>

      <section className="fotoband" style={{ backgroundImage: 'url(/bilder/tre-hastar.webp)' }}>
        <div className="fotoband-text">
          <h2>Grovfodret är grunden. Resten ska bara fylla luckorna.</h2>
          <p>
            De flesta hästar klarar sig på bra grovfoder och lite mineraler. Fodr visar vad din häst faktiskt behöver,
            så att du slipper gissa.
          </p>
        </div>
      </section>

      <section className="siffror" aria-label="Hästar i Sverige">
        <p className="siffror-rubrik">Hästsverige i siffror</p>
        <div className="siffror-rad">
          <div>
            <strong>355 500</strong>
            <span>hästar i Sverige</span>
          </div>
          <div>
            <strong>55 %</strong>
            <span>av privata hästägare utfodrar med hösilage</span>
          </div>
          <div>
            <strong>600–1 800 kr</strong>
            <span>kostar en grovfoderanalys</span>
          </div>
        </div>
        <p className="siffror-kalla">
          Källor: Jordbruksverket (hästräkning 2016), SLU-examensarbete 2022, Eurofins prislista för grovfoderanalys.
        </p>
      </section>

      <section className="start-sektion" id="sa-funkar">
        <p className="overrubrik">Så funkar det</p>
        <h2 className="sektion-rubrik">Tre steg, ett par minuter</h2>
        <div className="stegkort">
          <article className="stegkort-kort">
            <span className="stegkort-nr">1</span>
            <h3>Berätta om hästen</h3>
            <p>
              Vikt, hull, hur mycket den rids och om den haft fång. Du kan också skriva med egna ord, så fyller vi i.
            </p>
            <div className="stegkort-bild" style={{ backgroundImage: 'url(/bilder/palomino.webp)' }} />
          </article>
          <article className="stegkort-kort">
            <span className="stegkort-nr">2</span>
            <h3>Ladda upp analysen</h3>
            <p>PDF eller mobilfoto, från vilket labb som helst. Du ser alla värden vi läste ut och kan rätta dem.</p>
            <div className="stegkort-utsnitt" aria-hidden>
              <div className="utsnitt-rad">
                <span>Torrsubstans</span>
                <b>39,7 %</b>
              </div>
              <div className="utsnitt-rad">
                <span>Energi</span>
                <b>10,2 MJ</b>
              </div>
              <div className="utsnitt-rad">
                <span>Smältbart protein</span>
                <b>104 g</b>
              </div>
              <div className="utsnitt-rad">
                <span>Socker</span>
                <b>61 g</b>
              </div>
              <div className="utsnitt-rad saknas">
                <span>Selen</span>
                <b>saknas</b>
              </div>
            </div>
          </article>
          <article className="stegkort-kort">
            <span className="stegkort-nr">3</span>
            <h3>Få foderplanen</h3>
            <p>Vad du ska ge, gram per dag och kronor per månad. Och vad du kan sluta köpa.</p>
            <div className="stegkort-bild" style={{ backgroundImage: 'url(/bilder/hohack.webp)' }} />
          </article>
        </div>

        <div className="formagor">
          <div>
            <b>Varnar vid fång och EMS</b>
            <span>Väljer bort sockerrikt foder och säger till när veterinären bör vara med.</span>
          </div>
          <div>
            <b>Märkesneutral</b>
            <span>Produkter från flera butiker, billigaste kombinationen först.</span>
          </div>
          <div>
            <b>Journal över tid</b>
            <span>Vikt, hull och anteckningar. Planen räknas om när hästen förändras.</span>
          </div>
          <div>
            <b>Förklarat på svenska</b>
            <span>Inga förkortningar utan förklaring. Du förstår varför.</span>
          </div>
        </div>
      </section>

      <section className="start-sektion tvadelad" id="trovardigt">
        <div>
          <p className="overrubrik">Hur vi räknar</p>
          <h2 className="sektion-rubrik">”Hur vet jag att det stämmer?”</h2>
          <p className="brodtext">
            Hästens behov räknas med SLU:s utfodringsrekommendationer för häst, i vanlig kod som går att granska. AI
            används bara för att läsa rapporten och förklara resultatet. Den räknar aldrig själv.
          </p>
          <ul className="bocklista">
            <li>Varje rad i planen visar behov, vad hästen får och källan.</li>
            <li>Saknas ett värde i analysen står det tydligt, och vi gissar aldrig att det är noll.</li>
            <li>Fodr ersätter inte veterinären. Har hästen fång, EMS eller kolik säger vi till.</li>
          </ul>
        </div>
        <div
          className="tvadelad-bild"
          style={{ backgroundImage: 'url(/bilder/nosar.webp)' }}
          role="img"
          aria-label="Två hästar nos mot nos"
        />
      </section>

      <section className="start-sektion smal" id="fragor">
        <p className="overrubrik">Vanliga frågor</p>
        <h2 className="sektion-rubrik">Bra att veta</h2>
        <div className="fragelista">
          <details>
            <summary>Vilka labb fungerar?</summary>
            <p>
              Alla vanliga labbrapporter för grovfoder, både som PDF och som foto. Du kan alltid rätta värdena innan
              planen räknas.
            </p>
          </details>
          <details>
            <summary>Min analys saknar mineraler. Går det ändå?</summary>
            <p>
              Ja. Då använder vi typvärden för svenskt vallfoder och märker dem som uppskattade, så att du ser vad som
              är osäkert.
            </p>
          </details>
          <details>
            <summary>Ersätter Fodr veterinären eller en foderrådgivare?</summary>
            <p>
              Nej. Fodr hjälper dig förstå analysen och ger ett underlag. Vid sjukdom ska du alltid prata med veterinär.
            </p>
          </details>
          <details>
            <summary>Säljer ni foder?</summary>
            <p>Nej. Förslagen kommer från flera butiker och sorteras efter pris och hur väl de täcker behovet.</p>
          </details>
          <details>
            <summary>Var sparas mina uppgifter?</summary>
            <p>I den här prototypen sparas allt bara i din webbläsare.</p>
          </details>
        </div>
      </section>

      <section className="avslut" style={{ backgroundImage: 'url(/bilder/bete-island.webp)' }}>
        <div className="avslut-inre">
          <h2>Se vad ditt grovfoder räcker till</h2>
          <p>Testa med demohästen Sixten, eller lägg in din egen häst.</p>
          <button className="knapp stor ljus" onClick={onDemo}>
            {inloggadSom ? 'Öppna Fodr' : 'Testa med demohästen'}
          </button>
        </div>
      </section>

      <footer className="start-fot">
        <Ordmarke />
        <p>
          Prototyp från ett hackathon 2026. Behov enligt SLU Rapport 289. Ersätter inte veterinär eller foderrådgivare.
        </p>
        <p className="liten">Foton: Unsplash-fotografer via Wikimedia Commons (CC0).</p>
      </footer>
    </div>
  )
}

/** Riktig foderplan för demohästen, i en webbläsarram. Siffrorna räknas av samma motor som appen. */
function Produktbild({ produkter }: { produkter: Produkt[] }) {
  const plan = useMemo(() => {
    try {
      return skapaPlan(
        { ...demoHast, grovfoder: { ...demoHast.grovfoder, typ: analysKomplett.typ } },
        analysKomplett,
        produkter,
      )
    } catch {
      return null
    }
  }, [produkter])
  if (!plan) return null
  const poster = [...plan.behallnaFoder, ...(plan.urval?.poster ?? [])]
  const total = poster.reduce((s, p) => s + kostnadPerManad(p.produkt, p.gramPerDag), 0)

  return (
    <div className="produktbild" aria-label="Exempel på en foderplan i Fodr">
      <div className="produktbild-ram">
        <i />
        <i />
        <i />
        <span>fodr.se</span>
      </div>
      <div className="produktbild-yta">
        <aside className="pb-sido">
          <b>Hästar</b>
          <span className="pb-hast vald">
            <i>S</i>Sixten
          </span>
          <span className="pb-hast">
            <i>P</i>Pysen
          </span>
        </aside>
        <div className="pb-sida">
          <div className="pb-omslag" style={{ backgroundImage: 'url(/bilder/nosar.webp)' }} />
          <div className="pb-innehall">
            <div className="pb-titel">Sixten</div>
            <div className="pb-flikar">
              <span>Hästen</span>
              <span>Analysen</span>
              <span className="vald">Foderplan</span>
              <span>Journal</span>
            </div>
            <div className="pb-rader">
              <div className="pb-summa">
                <span>Per månad med förslaget</span>
                <strong>{kr(total)}</strong>
                {plan.nulageKostnadPerManad > total && (
                  <em>{kr(plan.nulageKostnadPerManad - total)} billigare än i dag</em>
                )}
              </div>
              <ol className="pb-atgarder">
                <li>Ge {tal(plan.grovfoderKgPerDag, 1)} kg hösilage per dag.</li>
                {plan.atgarder.slice(0, 3).map((a) => (
                  <li key={a.text} className={a.typ}>
                    {a.text}
                  </li>
                ))}
              </ol>
              {plan.varningar[0] && <div className="pb-callout">{plan.varningar[0]}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
