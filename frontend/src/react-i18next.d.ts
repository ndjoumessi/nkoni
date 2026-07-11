import 'i18next'
import type { Catalogue } from './locales/fr'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: Catalogue }
  }
}
