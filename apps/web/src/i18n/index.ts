import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import sv from './sv.json'

// ADR 0014: all UI text comes from a catalogue. The beta ships Swedish only; English becomes en.json.
// The catalogue is bundled and init is synchronous, so the first render already has its text and nothing suspends.
void i18n.use(initReactI18next).init({
  lng: 'sv-SE',
  fallbackLng: 'sv',
  resources: { sv: { translation: sv } },
  initAsync: false,
  // React escapes rendered text already.
  interpolation: { escapeValue: false },
})

/** The active locale for Intl formatting of numbers, dates and money. */
export const locale = (): string => i18n.language

export default i18n
