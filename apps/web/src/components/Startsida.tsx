import { useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { analysKomplett, demoHast } from '../data/exempel'
import { monthlyCost } from '@fodr/domain/intake'
import { skapaPlan } from '@fodr/domain/plan'
import type { Produkt } from '@fodr/domain/types'
import { enhet, kr, tal } from '../format'
import { domainText } from '../i18n/domain'
import { Ordmarke } from './Varumarke'

/** The figures band. Their sources are listed in landing.figures.sources. */
const SIFFROR = { hastar: 355_500, hosilageProcent: 55, analysKostnadKr: { min: 600, max: 1_800 } }

/** The lab report excerpt on step 2: typical values, with selenium shown as missing to illustrate the idea. */
const UTSNITT = { tsProcent: 39.7, perKgTs: { energi: 10.2, smbRp: 104, socker: 61 } }

interface Props {
  produkter: Produkt[]
  inloggadSom: string | null
  onDemo: () => void
  onLoggaIn: () => void
}

/** Marknadssidan: Notions upplägg (vit yta, tydlig rubrik, produktbild) med Wildlife-känsla (foton, serif, skogsgrönt). */
export function Startsida({ produkter, inloggadSom, onDemo, onLoggaIn }: Props) {
  const { t } = useTranslation()
  return (
    <div className="start">
      <header className="start-meny">
        <div className="start-meny-inre">
          <Ordmarke />
          <nav className="start-lankar" aria-label={t('landing.nav.label')}>
            <a href="#sa-funkar">{t('landing.nav.howItWorks')}</a>
            <a href="#trovardigt">{t('landing.nav.howWeCalculate')}</a>
            <a href="#fragor">{t('landing.nav.faq')}</a>
          </nav>
          <div className="start-meny-hoger">
            {!inloggadSom && (
              <button className="knapp text" onClick={onLoggaIn}>
                {t('landing.logIn')}
              </button>
            )}
            <button className="knapp kompakt" onClick={onDemo}>
              {inloggadSom ? t('landing.openApp') : t('landing.tryDemo')}
            </button>
          </div>
        </div>
      </header>

      <section className="start-hero">
        <p className="overrubrik">{t('landing.hero.eyebrow')}</p>
        <h1>
          <Trans i18nKey="landing.hero.title" components={{ mark: <span className="markering" /> }} />
        </h1>
        <p className="start-ingress">{t('landing.hero.intro')}</p>
        <div className="start-knappar">
          <button className="knapp stor" onClick={onDemo}>
            {inloggadSom ? t('landing.continueAs', { name: inloggadSom }) : t('landing.tryDemo')}
          </button>
          <a className="knapp stor sekundar" href="#sa-funkar">
            {t('landing.hero.seeHow')}
          </a>
        </div>
        <p className="start-not">{t('landing.hero.note')}</p>
        <Produktbild produkter={produkter} />
      </section>

      <p className="kallrad">
        <Trans i18nKey="landing.sourceLine" components={{ strong: <strong /> }} />
      </p>

      <section className="fotoband" style={{ backgroundImage: 'url(/bilder/tre-hastar.webp)' }}>
        <div className="fotoband-text">
          <h2>{t('landing.photoBand.title')}</h2>
          <p>{t('landing.photoBand.text')}</p>
        </div>
      </section>

      <section className="siffror" aria-label={t('landing.figures.label')}>
        <p className="siffror-rubrik">{t('landing.figures.title')}</p>
        <div className="siffror-rad">
          <div>
            <strong>{tal(SIFFROR.hastar, 0)}</strong>
            <span>{t('landing.figures.horsesText')}</span>
          </div>
          <div>
            <strong>{t('units.percent', { value: tal(SIFFROR.hosilageProcent, 0) })}</strong>
            <span>{t('landing.figures.haylageText')}</span>
          </div>
          <div>
            <strong>
              {t('landing.figures.analysisCost', {
                min: tal(SIFFROR.analysKostnadKr.min, 0),
                max: tal(SIFFROR.analysKostnadKr.max, 0),
              })}
            </strong>
            <span>{t('landing.figures.analysisCostText')}</span>
          </div>
        </div>
        <p className="siffror-kalla">{t('landing.figures.sources')}</p>
      </section>

      <section className="start-sektion" id="sa-funkar">
        <p className="overrubrik">{t('landing.steps.eyebrow')}</p>
        <h2 className="sektion-rubrik">{t('landing.steps.title')}</h2>
        <div className="stegkort">
          <article className="stegkort-kort">
            <span className="stegkort-nr">1</span>
            <h3>{t('landing.steps.horseTitle')}</h3>
            <p>{t('landing.steps.horseText')}</p>
            <div className="stegkort-bild" style={{ backgroundImage: 'url(/bilder/palomino.webp)' }} />
          </article>
          <article className="stegkort-kort">
            <span className="stegkort-nr">2</span>
            <h3>{t('landing.steps.analysisTitle')}</h3>
            <p>{t('landing.steps.analysisText')}</p>
            <div className="stegkort-utsnitt" aria-hidden>
              <div className="utsnitt-rad">
                <span>{t('landing.steps.sample.dryMatter')}</span>
                <b>{t('units.percent', { value: tal(UTSNITT.tsProcent, 1) })}</b>
              </div>
              <div className="utsnitt-rad">
                <span>{t('landing.steps.sample.energy')}</span>
                <b>{t('units.quantity', { value: tal(UTSNITT.perKgTs.energi, 1), unit: enhet('energi') })}</b>
              </div>
              <div className="utsnitt-rad">
                <span>{t('landing.steps.sample.protein')}</span>
                <b>{t('units.quantity', { value: tal(UTSNITT.perKgTs.smbRp, 1), unit: enhet('smbRp') })}</b>
              </div>
              <div className="utsnitt-rad">
                <span>{t('landing.steps.sample.sugar')}</span>
                <b>{t('units.quantity', { value: tal(UTSNITT.perKgTs.socker, 1), unit: enhet('socker') })}</b>
              </div>
              <div className="utsnitt-rad saknas">
                <span>{t('landing.steps.sample.selenium')}</span>
                <b>{t('landing.steps.sample.missing')}</b>
              </div>
            </div>
          </article>
          <article className="stegkort-kort">
            <span className="stegkort-nr">3</span>
            <h3>{t('landing.steps.planTitle')}</h3>
            <p>{t('landing.steps.planText')}</p>
            <div className="stegkort-bild" style={{ backgroundImage: 'url(/bilder/hohack.webp)' }} />
          </article>
        </div>

        <div className="formagor">
          <div>
            <b>{t('landing.features.emsTitle')}</b>
            <span>{t('landing.features.emsText')}</span>
          </div>
          <div>
            <b>{t('landing.features.neutralTitle')}</b>
            <span>{t('landing.features.neutralText')}</span>
          </div>
          <div>
            <b>{t('landing.features.journalTitle')}</b>
            <span>{t('landing.features.journalText')}</span>
          </div>
          <div>
            <b>{t('landing.features.swedishTitle')}</b>
            <span>{t('landing.features.swedishText')}</span>
          </div>
        </div>
      </section>

      <section className="start-sektion tvadelad" id="trovardigt">
        <div>
          <p className="overrubrik">{t('landing.trust.eyebrow')}</p>
          <h2 className="sektion-rubrik">{t('landing.trust.title')}</h2>
          <p className="brodtext">{t('landing.trust.text')}</p>
          <ul className="bocklista">
            <li>{t('landing.trust.source')}</li>
            <li>{t('landing.trust.missing')}</li>
            <li>{t('landing.trust.vet')}</li>
          </ul>
        </div>
        <div
          className="tvadelad-bild"
          style={{ backgroundImage: 'url(/bilder/nosar.webp)' }}
          role="img"
          aria-label={t('landing.trust.imageLabel')}
        />
      </section>

      <section className="start-sektion smal" id="fragor">
        <p className="overrubrik">{t('landing.faq.eyebrow')}</p>
        <h2 className="sektion-rubrik">{t('landing.faq.title')}</h2>
        <div className="fragelista">
          <details>
            <summary>{t('landing.faq.labsQ')}</summary>
            <p>{t('landing.faq.labsA')}</p>
          </details>
          <details>
            <summary>{t('landing.faq.mineralsQ')}</summary>
            <p>{t('landing.faq.mineralsA')}</p>
          </details>
          <details>
            <summary>{t('landing.faq.vetQ')}</summary>
            <p>{t('landing.faq.vetA')}</p>
          </details>
          <details>
            <summary>{t('landing.faq.sellQ')}</summary>
            <p>{t('landing.faq.sellA')}</p>
          </details>
          <details>
            <summary>{t('landing.faq.storageQ')}</summary>
            <p>{t('landing.faq.storageA')}</p>
          </details>
        </div>
      </section>

      <section className="avslut" style={{ backgroundImage: 'url(/bilder/bete-island.webp)' }}>
        <div className="avslut-inre">
          <h2>{t('landing.closing.title')}</h2>
          <p>{t('landing.closing.text')}</p>
          <button className="knapp stor ljus" onClick={onDemo}>
            {inloggadSom ? t('landing.openApp') : t('landing.tryDemo')}
          </button>
        </div>
      </section>

      <footer className="start-fot">
        <Ordmarke />
        <p>{t('landing.footer.text')}</p>
        <p className="liten">{t('landing.footer.photos')}</p>
      </footer>
    </div>
  )
}

/** Riktig foderplan för demohästen, i en webbläsarram. Siffrorna räknas av samma motor som appen. */
function Produktbild({ produkter }: { produkter: Produkt[] }) {
  const { t } = useTranslation()
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
  const total = poster.reduce((s, p) => s + monthlyCost(p.produkt, p.gramPerDag), 0)

  return (
    <div className="produktbild" aria-label={t('landing.preview.label')}>
      <div className="produktbild-ram">
        <i />
        <i />
        <i />
        <span>{t('landing.preview.address')}</span>
      </div>
      <div className="produktbild-yta">
        <aside className="pb-sido">
          <b>{t('landing.preview.horses')}</b>
          <span className="pb-hast vald">
            <i>{t('landing.preview.horse1Initial')}</i>
            {t('landing.preview.horse1')}
          </span>
          <span className="pb-hast">
            <i>{t('landing.preview.horse2Initial')}</i>
            {t('landing.preview.horse2')}
          </span>
        </aside>
        <div className="pb-sida">
          <div className="pb-omslag" style={{ backgroundImage: 'url(/bilder/nosar.webp)' }} />
          <div className="pb-innehall">
            <div className="pb-titel">{t('landing.preview.horse1')}</div>
            <div className="pb-flikar">
              <span>{t('steps.hast')}</span>
              <span>{t('steps.analys')}</span>
              <span className="vald">{t('steps.plan')}</span>
              <span>{t('steps.journal')}</span>
            </div>
            <div className="pb-rader">
              <div className="pb-summa">
                <span>{t('landing.preview.perMonth')}</span>
                <strong>{kr(total)}</strong>
                {plan.nulageKostnadPerManad > total && (
                  <em>{t('landing.preview.cheaper', { amount: kr(plan.nulageKostnadPerManad - total) })}</em>
                )}
              </div>
              <ol className="pb-atgarder">
                <li>{t('plan.giveRoughage', { kg: tal(plan.grovfoderKgPerDag, 1), type: t('roughage.hosilage') })}</li>
                {plan.atgarder.slice(0, 3).map((a) => {
                  const text = domainText(a)
                  return (
                    <li key={text} className={a.typ}>
                      {text}
                    </li>
                  )
                })}
              </ol>
              {plan.varningar[0] && <div className="pb-callout">{domainText(plan.varningar[0])}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
