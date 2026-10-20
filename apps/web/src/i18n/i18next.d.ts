import 'i18next'
import type sv from './sv.json'

// Typed keys: a misspelt or missing key is a type error. The Swedish catalogue is the source of truth.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof sv }
  }
}
