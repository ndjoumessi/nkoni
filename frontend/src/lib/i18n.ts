/**
 * Configuration i18n du frontend (§4) — `react-i18next`.
 *
 * Catalogues FR/EN **chargés à la demande** (`import()` dynamique → un chunk par langue) : seul
 * le catalogue de la langue ACTIVE entre dans le bundle de démarrage ; l'autre n'est téléchargé
 * qu'au moment d'un changement de langue. L'init est explicite (`initI18n`, attendue par
 * `main.tsx` AVANT le 1er rendu → aucun flash non traduit), et non plus un side-effect d'import.
 *
 * La langue affichée est une PRÉFÉRENCE PERSONNELLE (§4 : « sélectionnable par utilisateur ») :
 *   - avant connexion : mémorisée en `localStorage` (repli : langue du navigateur, puis FR) ;
 *   - après connexion : la préférence serveur (`Utilisateur.langue`) est appliquée via
 *     `appliquerLangue()` par le contexte d'auth, et prime.
 *
 * Le backend et l'API échangent des codes majuscules `FR`/`EN` (enum `Langue`) ; i18next utilise
 * les codes minuscules `fr`/`en`. Les helpers `versI18n` / `versBackend` font le pont.
 *
 * Parité FR/EN garantie à la compilation (`en/index` typé `Catalogue`) : charger la SEULE langue
 * active est sûr, aucun repli vers FR n'est nécessaire pour combler une clé manquante.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export type Langue = 'FR' | 'EN'

const STORAGE_KEY = 'nkoni:langue'

/** Chargeurs dynamiques : chaque catalogue devient son propre chunk (sorti du bundle initial). */
const chargeurs: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  fr: () => import('@/locales/fr'),
  en: () => import('@/locales/en'),
}

/** Langues dont le catalogue est déjà injecté dans i18next (évite un double chargement). */
const chargees = new Set<string>()

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

/** Charge (une fois) le catalogue d'une langue et l'injecte dans i18next. */
async function chargerCatalogue(code: string): Promise<void> {
  if (chargees.has(code)) return
  const chargeur = chargeurs[code] ?? chargeurs['fr']!
  const module = await chargeur()
  i18n.addResourceBundle(code, 'translation', module.default, true, true)
  chargees.add(code)
}

/**
 * Initialise i18next avec le SEUL catalogue de la langue de démarrage. À appeler (et attendre)
 * une fois, avant le premier rendu (`main.tsx`).
 */
export async function initI18n(): Promise<void> {
  const lng = langueInitiale()
  const module = await (chargeurs[lng] ?? chargeurs['fr']!)()
  chargees.add(lng)
  await i18n.use(initReactI18next).init({
    resources: { [lng]: { translation: module.default } },
    lng,
    fallbackLng: 'fr',
    interpolation: { escapeValue: false }, // React échappe déjà le rendu
  })
  // `<html lang>` suit la langue ACTIVE (a11y : prononciation correcte des lecteurs d'écran,
  // WCAG 3.1.1) — appliqué à la langue de démarrage puis à chaque basculement.
  document.documentElement.lang = lng
  i18n.on('languageChanged', (code) => {
    document.documentElement.lang = code
  })
}

/** Charge le catalogue cible si besoin, puis bascule l'interface. */
async function chargerEtBasculer(code: string): Promise<void> {
  await chargerCatalogue(code)
  if (i18n.language !== code) await i18n.changeLanguage(code)
}

/**
 * Applique une langue (code backend `FR`/`EN`) à toute l'interface et la mémorise pour les
 * prochains chargements. Appelée par le contexte d'auth (préférence serveur) et le sélecteur.
 * Signature `void` (fire-and-forget) : le chargement du catalogue et le basculement sont
 * asynchrones ; react-i18next déclenche le re-render sur l'événement `languageChanged`.
 */
export function appliquerLangue(langue: Langue): void {
  const code = versI18n(langue)
  localStorage.setItem(STORAGE_KEY, code)
  void chargerEtBasculer(code)
}

/** Langue courante de l'interface, en code backend. */
export function langueCourante(): Langue {
  return versBackend(i18n.language)
}

/**
 * Clé i18n DYNAMIQUE (indexée par une variable / valeur d'énum, connue seulement au runtime).
 * Le typage de `t()` vérifie désormais l'EXISTENCE des clés STATIQUES à la compilation ; ce helper
 * contourne ce contrôle pour les clés calculées à l'exécution. Runtime : simple identité.
 * Usage : `t(cleI18n(`amendes.statuts.${statut}`))`.
 */
export function cleI18n(cle: string): never {
  return cle as never
}

export default i18n
