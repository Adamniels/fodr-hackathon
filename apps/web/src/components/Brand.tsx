import { useTranslation } from 'react-i18next'

/** Hästsko som logotyp. Färgen ärvs från texten. */
export function Logo({ storlek = 22 }: { storlek?: number }) {
  return (
    <svg width={storlek} height={storlek} viewBox="0 0 32 32" aria-hidden className="logga-ikon">
      <path
        d="M8 5.5v9.5a8 8 0 0 0 16 0V5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <g fill="var(--logga-hal, rgba(0,0,0,.55))">
        <circle cx="8" cy="9" r="0.9" />
        <circle cx="8" cy="14" r="0.9" />
        <circle cx="24" cy="9" r="0.9" />
        <circle cx="24" cy="14" r="0.9" />
      </g>
    </svg>
  )
}

export function Wordmark() {
  const { t } = useTranslation()
  return (
    <span className="ordmarke">
      <Logo />
      {t('common.brand')}
    </span>
  )
}
