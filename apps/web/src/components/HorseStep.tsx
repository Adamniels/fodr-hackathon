import { useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { interpretProfile } from '../api'
import { RASER, hittaRas } from '@fodr/domain/breeds'
import { BYTESTAKT, standardKanslighet } from '@fodr/domain/transition'
import { viktFranBrostomfang } from '@fodr/domain/slu'
import { validateProfile, type ProfileField } from '@fodr/domain/validation'
import {
  INGREDIENSER,
  type Bytekanslighet,
  type Halsa,
  type Hastprofil,
  type Hasttyp,
  type Kon,
  type Miljo,
  type Prestanda,
  type Produkt,
} from '@fodr/domain/types'
import { bodyConditionText, breedName, formatNumber } from '../format'
import { domainText } from '../i18n/domain'
import { DecimalInput } from './DecimalInput'

interface Props {
  selected: Hastprofil | undefined
  produkter: Produkt[]
  onChange: (h: Hastprofil) => void
  onNew: () => void
  onDelete: (id: string) => Promise<void>
  onNext: () => void
}

const PRESTANDA = [
  'fritid',
  'tavling_lokal',
  'tavling_hog',
  'trav_galopp_traning',
  'distans',
] as const satisfies readonly Prestanda[]

const STANDARD_MILJO: Miljo = { hallning: 'box', timmarUtePerDag: 8, klippt: false, tacke: true, lagstaTempC: -5 }

const TYPER = ['lattfodd', 'normalfodd', 'svarfodd'] as const satisfies readonly Hasttyp[]

export function HorseStep({ selected, produkter, onChange, onNew, onDelete, onNext }: Props) {
  const { t } = useTranslation()
  // The horse list lives in the app's sidebar; this shows only the selected horse's profile.
  return selected ? (
    <ProfileForm
      key={selected.id}
      hast={selected}
      produkter={produkter}
      onChange={onChange}
      onDelete={() => onDelete(selected.id)}
      onNext={onNext}
    />
  ) : (
    <section className="kort tomt">
      <h2>{t('horse.welcome.title')}</h2>
      <p className="ingress">{t('horse.welcome.intro')}</p>
      <button className="knapp" onClick={onNew}>
        {t('horse.welcome.add')}
      </button>
    </section>
  )
}

function ProfileForm({
  hast,
  produkter,
  onChange,
  onDelete,
  onNext,
}: {
  hast: Hastprofil
  produkter: Produkt[]
  onChange: (h: Hastprofil) => void
  onDelete: () => Promise<void>
  onNext: () => void
}) {
  const { t } = useTranslation()
  const set = (patch: Partial<Hastprofil>) => onChange({ ...hast, ...patch })
  const errorFor = useErrors(hast)
  const [matt, setMatt] = useState({ brost: '', langd: '' })
  const uppskattadVikt =
    Number(matt.brost) > 0 && Number(matt.langd) > 0
      ? Math.round(viktFranBrostomfang(Number(matt.brost), Number(matt.langd)))
      : null

  return (
    <section className="kort profil">
      <h2>{t('horse.title', { name: hast.namn || t('common.theHorse') })}</h2>
      <p className="ingress">{t('horse.intro')}</p>

      <AiFill hast={hast} produkter={produkter} onChange={onChange} />

      <h3 className="rubrik">{t('horse.basics')}</h3>

      <div className="grupp">
        <Field label={t('horse.name')}>
          <input value={hast.namn} onChange={(e) => set({ namn: e.target.value })} />
        </Field>
        <Field label={t('horse.age')}>
          <NumberField value={hast.alderAr} error={errorFor('alderAr')} onChange={(v) => set({ alderAr: v })} />
        </Field>
        <Field label={t('horse.sex.label')}>
          <select value={hast.kon} onChange={(e) => set({ kon: e.target.value as Kon })}>
            <option value="sto">{t('horse.sex.sto')}</option>
            <option value="valack">{t('horse.sex.valack')}</option>
            <option value="hingst">{t('horse.sex.hingst')}</option>
          </select>
        </Field>
      </div>

      <Field label={t('horse.breed')} hint={breedHint(hast, t)}>
        <select
          value={hast.ras ?? ''}
          onChange={(e) => {
            const ras = hittaRas(e.target.value)
            set({ ras: ras?.id, ...(ras ? { typ: ras.typ } : {}) })
          }}
        >
          <option value="">{t('horse.breedOther')}</option>
          {RASER.map((r) => (
            <option key={r.id} value={r.id}>
              {breedName(r.id)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('horse.type.label')} hint={t('horse.type.hint')} group>
        <div className="segment">
          {TYPER.map((id) => (
            <button
              key={id}
              className={hast.typ === id ? 'aktiv' : ''}
              onClick={() => set({ typ: id })}
              title={t(`horse.type.${id}.hint`)}
            >
              {t(`horse.type.${id}.name`)}
              <small>{t(`horse.type.${id}.hint`)}</small>
            </button>
          ))}
        </div>
      </Field>

      <div className="grupp">
        <Field label={t('horse.weight')}>
          <NumberField value={hast.viktKg} error={errorFor('viktKg')} onChange={(v) => set({ viktKg: v })} />
        </Field>
        <Field label={t('horse.chest')} hint={t('horse.chestHint')}>
          <input inputMode="numeric" value={matt.brost} onChange={(e) => setMatt({ ...matt, brost: e.target.value })} />
        </Field>
        <Field label={t('horse.length')}>
          <input inputMode="numeric" value={matt.langd} onChange={(e) => setMatt({ ...matt, langd: e.target.value })} />
        </Field>
      </div>
      {uppskattadVikt !== null && uppskattadVikt > 0 && (
        <div className="tips">
          {t('horse.weightEstimate', { kg: formatNumber(uppskattadVikt, 1) })}{' '}
          <button className="lank" onClick={() => set({ viktKg: uppskattadVikt })}>
            {t('horse.useEstimate')}
          </button>
        </div>
      )}

      <Field
        label={t('horse.hullLabel', { hull: formatNumber(hast.hull, 0), text: bodyConditionText(hast.hull) })}
        hint={t('horse.hullHint')}
      >
        <input
          type="range"
          min={1}
          max={9}
          value={hast.hull}
          aria-invalid={errorFor('hull') ? true : undefined}
          onChange={(e) => set({ hull: Number(e.target.value) })}
        />
        {errorFor('hull') && <span className="falt-fel">{errorFor('hull')}</span>}
      </Field>

      <h3 className="rubrik">{t('horse.work')}</h3>
      <Field label={t('horse.discipline')} hint={t('horse.disciplineHint')}>
        <select value={hast.prestanda ?? 'fritid'} onChange={(e) => set({ prestanda: e.target.value as Prestanda })}>
          {PRESTANDA.map((id) => (
            <option key={id} value={id}>
              {t(`horse.performance.${id}`)}
            </option>
          ))}
        </select>
      </Field>
      <div className="grupp">
        <Field label={t('horse.sessionsPerWeek')}>
          <NumberField
            value={hast.ridning?.passPerVecka ?? 0}
            error={errorFor('ridning.passPerVecka')}
            onChange={(v) => set({ ridning: { ...ridning(hast), passPerVecka: v } })}
          />
        </Field>
        <Field label={t('horse.minutesPerSession')}>
          <NumberField
            value={hast.ridning?.minuterPerPass ?? 0}
            error={errorFor('ridning.minuterPerPass')}
            onChange={(v) => set({ ridning: { ...ridning(hast), minuterPerPass: v } })}
          />
        </Field>
        <Field label={t('horse.trotCanter')}>
          <NumberField
            value={hast.ridning?.travGaloppMinPerPass ?? 0}
            error={errorFor('ridning.travGaloppMinPerPass')}
            onChange={(v) => set({ ridning: { ...ridning(hast), travGaloppMinPerPass: v } })}
          />
        </Field>
      </div>

      <EnvironmentSection
        miljo={hast.miljo ?? STANDARD_MILJO}
        errorFor={errorFor}
        onChange={(miljo) => set({ miljo })}
      />

      <h3 className="rubrik">{t('horse.roughageSection')}</h3>
      <div className="grupp">
        <Field label={t('horse.roughage')}>
          <select
            value={hast.grovfoder.typ}
            onChange={(e) => set({ grovfoder: { ...hast.grovfoder, typ: e.target.value as 'hosilage' | 'ho' } })}
          >
            <option value="hosilage">{t('roughageTitle.hosilage')}</option>
            <option value="ho">{t('roughageTitle.ho')}</option>
          </select>
        </Field>
        <Field label={t('horse.roughageKg')}>
          <NumberField
            value={hast.grovfoder.kgPerDag}
            error={errorFor('grovfoder.kgPerDag')}
            onChange={(v) => set({ grovfoder: { ...hast.grovfoder, kgPerDag: v } })}
          />
        </Field>
      </div>
      <FeedList hast={hast} produkter={produkter} errorFor={errorFor} onChange={onChange} />

      <HealthSection halsa={hast.halsa} onChange={(halsa) => set({ halsa })} />
      <FeedChangeSensitivitySection hast={hast} onChange={(bytekanslighet) => set({ bytekanslighet })} />
      <Field label={t('horse.other')}>
        <input value={hast.halsa.ovrigt} onChange={(e) => set({ halsa: { ...hast.halsa, ovrigt: e.target.value } })} />
      </Field>

      <div className="atgardsrad">
        <DeleteHorse name={hast.namn || t('common.theHorse')} onDelete={onDelete} />
        <button className="knapp" disabled={!hast.namn} onClick={onNext}>
          {t('horse.toAnalysis')}
        </button>
      </div>
    </section>
  )
}

/** Deleting asks first (CF2), in a modal dialog that keeps focus until it is answered. */
function DeleteHorse({ name, onDelete }: { name: string; onDelete: () => Promise<void> }) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const confirm = async () => {
    setBusy(true)
    setFailed(false)
    try {
      // On success the horse's profile, and this dialog with it, goes away.
      await onDelete()
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }
  return (
    <>
      <button className="knapp sekundar ta-bort" onClick={() => dialog.current?.showModal()}>
        {t('horse.delete.button')}
      </button>
      <dialog ref={dialog} className="bekrafta" aria-labelledby={titleId} onClose={() => setFailed(false)}>
        <h2 id={titleId}>{t('horse.delete.title', { name })}</h2>
        <p>{t('horse.delete.body')}</p>
        {failed && (
          <p className="ruta fel" role="alert">
            {t('horse.delete.failed')}
          </p>
        )}
        <div className="atgardsrad">
          <button className="knapp sekundar" onClick={() => dialog.current?.close()}>
            {t('horse.delete.cancel')}
          </button>
          <button className="knapp" disabled={busy} onClick={() => void confirm()}>
            {t('horse.delete.confirm')}
          </button>
        </div>
      </dialog>
    </>
  )
}

function breedHint(h: Hastprofil, t: TFunction): string | undefined {
  const ras = hittaRas(h.ras)
  if (!ras?.viktKg) return undefined
  return t('horse.breedWeight', { min: formatNumber(ras.viktKg.min, 1), max: formatNumber(ras.viktKg.max, 1) })
}

function EnvironmentSection({
  miljo,
  errorFor,
  onChange,
}: {
  miljo: Miljo
  errorFor: ErrorFor
  onChange: (m: Miljo) => void
}) {
  const { t } = useTranslation()
  const set = (patch: Partial<Miljo>) => onChange({ ...miljo, ...patch })
  return (
    <>
      <h3 className="rubrik">{t('horse.environment.title')}</h3>
      <div className="grupp">
        <Field label={t('horse.environment.housing')}>
          <select value={miljo.hallning} onChange={(e) => set({ hallning: e.target.value as Miljo['hallning'] })}>
            <option value="box">{t('horse.environment.box')}</option>
            <option value="losdrift">{t('horse.environment.losdrift')}</option>
          </select>
        </Field>
        <Field label={t('horse.environment.hoursOut')}>
          <NumberField
            value={miljo.timmarUtePerDag}
            error={errorFor('miljo.timmarUtePerDag')}
            onChange={(v) => set({ timmarUtePerDag: v })}
          />
        </Field>
        <Field label={t('horse.environment.lowestTemp')} hint={t('horse.environment.lowestTempHint')}>
          <NumberField
            value={miljo.lagstaTempC}
            needsMinusKey
            error={errorFor('miljo.lagstaTempC')}
            onChange={(v) => set({ lagstaTempC: v })}
          />
        </Field>
      </div>
      <div className="kryss">
        <label>
          <input type="checkbox" checked={miljo.klippt} onChange={(e) => set({ klippt: e.target.checked })} />
          {t('horse.environment.clipped')}
        </label>
        <label>
          <input type="checkbox" checked={miljo.tacke} onChange={(e) => set({ tacke: e.target.checked })} />
          {t('horse.environment.rug')}
        </label>
      </div>
    </>
  )
}

const KANSLIGHETER = [
  'fang',
  'ems',
  'ppid',
  'magsar',
  'pssm',
  'luftvagar',
  'tandproblem',
  'proteinkanslig',
] as const satisfies readonly (keyof Halsa)[]

function HealthSection({ halsa, onChange }: { halsa: Halsa; onChange: (h: Halsa) => void }) {
  const { t } = useTranslation()
  const undvik = halsa.undvik ?? []
  return (
    <>
      <h3 className="rubrik">{t('horse.health.title')}</h3>
      <p className="falt-hjalp">{t('horse.health.hint')}</p>
      <div className="kryss">
        {KANSLIGHETER.map((nyckel) => (
          <label key={nyckel}>
            <input
              type="checkbox"
              checked={Boolean(halsa[nyckel])}
              onChange={(e) => onChange({ ...halsa, [nyckel]: e.target.checked })}
            />
            {t(`horse.health.${nyckel}`)}
          </label>
        ))}
      </div>
      <Field label={t('horse.health.avoid')} group>
        <div className="chips">
          {INGREDIENSER.map((i) => (
            <button
              key={i}
              type="button"
              className={`chip-val ${undvik.includes(i) ? 'aktiv' : ''}`}
              onClick={() =>
                onChange({ ...halsa, undvik: undvik.includes(i) ? undvik.filter((x) => x !== i) : [...undvik, i] })
              }
            >
              {i}
            </button>
          ))}
        </div>
      </Field>
    </>
  )
}

const KANSLIGHETSORDNING: Bytekanslighet[] = ['tal', 'normal', 'kanslig']

function FeedChangeSensitivitySection({ hast, onChange }: { hast: Hastprofil; onChange: (k: Bytekanslighet) => void }) {
  const { t } = useTranslation()
  const forval = standardKanslighet(hast.halsa)
  const selected = hast.bytekanslighet ?? forval
  const hint = hast.bytekanslighet
    ? t('horse.sensitivity.hintChosen')
    : forval === 'kanslig'
      ? t('horse.sensitivity.hintDefaultSensitive')
      : t('horse.sensitivity.hintDefault')
  return (
    <>
      <Field label={t('horse.sensitivity.label', { name: hast.namn || t('common.theHorse') })} hint={hint} group>
        <div className="segment" role="radiogroup" aria-label={t('horse.sensitivity.groupLabel')}>
          {KANSLIGHETSORDNING.map((k) => {
            const takt = BYTESTAKT[k]
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={selected === k}
                className={selected === k ? 'aktiv' : ''}
                onClick={() => onChange(k)}
              >
                {t(`transitionPace.${k}.name`)}
                <small>
                  {t(`transitionPace.${k}.description`)}{' '}
                  {t('horse.sensitivity.duration', { days: formatNumber(takt.dagar, 0) })}
                </small>
              </button>
            )
          })}
        </div>
      </Field>
    </>
  )
}

function ridning(h: Hastprofil) {
  return h.ridning ?? { passPerVecka: 0, minuterPerPass: 0, travGaloppMinPerPass: 0 }
}

function FeedList({
  hast,
  produkter,
  errorFor,
  onChange,
}: {
  hast: Hastprofil
  produkter: Produkt[]
  errorFor: ErrorFor
  onChange: (h: Hastprofil) => void
}) {
  const { t } = useTranslation()
  const foder = hast.nuvarandeFoder
  const satt = (i: number, patch: Partial<(typeof foder)[number]>) =>
    onChange({ ...hast, nuvarandeFoder: foder.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  return (
    <div className="foderlista">
      {/* Searchable list: a name matching a product is linked to it, otherwise it is saved as a custom feed. */}
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
            placeholder={t('horse.feeds.searchPlaceholder')}
            value={f.namn}
            className={f.produktId ? '' : 'okand-produkt'}
            title={f.produktId ? undefined : t('horse.feeds.unknownProduct')}
            onChange={(e) => {
              const p = produkter.find((x) => x.namn === e.target.value)
              satt(i, { produktId: p?.id ?? null, namn: e.target.value })
            }}
          />
          <NumberField
            value={f.gramPerDag}
            error={errorFor(`nuvarandeFoder.${i}.gramPerDag`)}
            onChange={(v) => satt(i, { gramPerDag: v })}
          />
          <span className="enhet">{t('horse.feeds.gramsPerDay')}</span>
          <button
            className="lank"
            onClick={() => onChange({ ...hast, nuvarandeFoder: foder.filter((_, j) => j !== i) })}
          >
            {t('horse.feeds.remove')}
          </button>
        </div>
      ))}
      <button
        className="lank"
        onClick={() =>
          onChange({ ...hast, nuvarandeFoder: [...foder, { produktId: null, namn: '', gramPerDag: 100 }] })
        }
      >
        {t('horse.feeds.add')}
      </button>
    </div>
  )
}

function AiFill({
  hast,
  produkter,
  onChange,
}: {
  hast: Hastprofil
  produkter: Produkt[]
  onChange: (h: Hastprofil) => void
}) {
  const { t } = useTranslation()
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
      const t = await interpretProfile({
        foderText,
        halsaText,
        tidigareSvar: allaSvar,
        produkter: produkter.map((p) => ({ id: p.id, namn: p.namn })),
      })
      const ras = hittaRas(t.ras ?? undefined)
      const miljo = hast.miljo ?? STANDARD_MILJO
      onChange({
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
        // The AI can only add sensitivities, never remove ones the owner has ticked.
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
        <span className="ai-bricka">{t('common.aiBadge')}</span> {t('horse.ai.title')}
      </div>
      <Field label={t('horse.ai.about')}>
        <textarea
          rows={3}
          placeholder={t('horse.ai.aboutPlaceholder')}
          value={foderText}
          onChange={(e) => setFoderText(e.target.value)}
        />
      </Field>
      <Field label={t('horse.ai.health')}>
        <textarea
          rows={2}
          placeholder={t('horse.ai.healthPlaceholder')}
          value={halsaText}
          onChange={(e) => setHalsaText(e.target.value)}
        />
      </Field>
      {fragor.length > 0 && (
        <div className="foljdfragor">
          {fragor.map((f) => (
            <Field key={f} label={f}>
              <input value={svar[f] ?? ''} onChange={(e) => setSvar({ ...svar, [f]: e.target.value })} />
            </Field>
          ))}
        </div>
      )}
      {fel && <div className="ruta fel">{fel}</div>}
      <button
        className="knapp sekundar"
        disabled={laddar || (!foderText && !halsaText)}
        onClick={() => void kor(fragor.filter((f) => svar[f]).map((f) => ({ fraga: f, svar: svar[f] })))}
      >
        {laddar ? t('horse.ai.interpreting') : fragor.length ? t('horse.ai.answer') : t('horse.ai.fill')}
      </button>
    </div>
  )
}

function Field({
  label,
  hint,
  group,
  children,
}: {
  label: string
  hint?: string
  group?: boolean
  children: React.ReactNode
}) {
  // A button group must not sit inside <label>, or a click on the label activates the first button.
  const Tag = group ? 'div' : 'label'
  return (
    <Tag className="falt">
      <span className="falt-label">{label}</span>
      {children}
      {hint && <span className="falt-hjalp">{hint}</span>}
    </Tag>
  )
}

function NumberField({
  value,
  error,
  onChange,
  needsMinusKey,
}: {
  value: number
  error?: string
  onChange: (v: number) => void
  needsMinusKey?: boolean
}) {
  return <DecimalInput value={value} error={error} onChange={onChange} needsMinusKey={needsMinusKey} />
}

type ErrorFor = (field: ProfileField) => string | undefined

/** The validation message for each field of the stored profile, so a value from any source shows its error (#13). */
function useErrors(hast: Hastprofil): ErrorFor {
  const errors = useMemo(() => validateProfile(hast), [hast])
  return (field) => {
    const error = errors.find((e) => e.field === field)
    return error && domainText(error.message)
  }
}
