/**
 * Configuration i18n du frontend (§4) — `react-i18next`.
 *
 * Deux catalogues (`fr.json`, `en.json`) bundlés par Vite. La langue affichée est une PRÉFÉRENCE
 * PERSONNELLE (§4 : « sélectionnable par utilisateur ») :
 *   - avant connexion : mémorisée en `localStorage` (repli : langue du navigateur, puis FR) ;
 *   - après connexion : la préférence serveur (`Utilisateur.langue`) est appliquée via
 *     `appliquerLangue()` par le contexte d'auth, et prime.
 *
 * Le backend et l'API échangent des codes majuscules `FR`/`EN` (enum `Langue`) ; i18next utilise
 * les codes minuscules `fr`/`en`. Les helpers `versI18n` / `versBackend` font le pont.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import fr from '@/locales/fr.json'
import en from '@/locales/en.json'

export type Langue = 'FR' | 'EN'

const STORAGE_KEY = 'nkoni:langue'

/** Code backend (`FR`/`EN`) → code i18next (`fr`/`en`). */
export const versI18n = (langue: Langue): string => (langue === 'EN' ? 'en' : 'fr')

/** Code quelconque → langue backend (`FR`/`EN`). */
export const versBackend = (code: string | null | undefined): Langue =>
  code?.toLowerCase().startsWith('en') ? 'EN' : 'FR'

/** Langue de démarrage : préférence mémorisée → langue du navigateur → FR. */
function langueInitiale(): string {
  const stocke = localStorage.getItem(STORAGE_KEY)
  if (stocke === 'fr' || stocke === 'en') return stocke
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'fr'
}

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: langueInitiale(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false }, // React échappe déjà le rendu
})

/**
 * Applique une langue (code backend `FR`/`EN`) à toute l'interface et la mémorise pour les
 * prochains chargements. Appelée par le contexte d'auth (préférence serveur) et le sélecteur.
 */
export function appliquerLangue(langue: Langue): void {
  const code = versI18n(langue)
  localStorage.setItem(STORAGE_KEY, code)
  if (i18n.language !== code) void i18n.changeLanguage(code)
}

/** Langue courante de l'interface, en code backend. */
export function langueCourante(): Langue {
  return versBackend(i18n.language)
}

export default i18n
