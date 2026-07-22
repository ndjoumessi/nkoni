/**
 * Formatage locale-aware des montants et nombres (§4/§5, lot F6).
 *
 * - La LANGUE suit l'interface (i18next) → grouping des nombres, symbole de devise placé selon
 *   la locale (FR « 30 000 € » / EN « €30,000 »).
 * - La DEVISE est celle de l'organisation courante (`Organisation.devise`), appliquée par le
 *   contexte d'auth via `appliquerDevise()` à la connexion / réhydratation (miroir de la langue,
 *   cf. `appliquerLangue`). Défaut FCFA avant connexion (aucun montant affiché sur le public).
 */
import i18n from '@/lib/i18n'

export type Devise = 'FCFA' | 'EUR' | 'USD' | 'CAD'

/**
 * Code ISO 4217 par devise. `FCFA` n'EST PAS un code ISO → on formate via `XAF` (franc CFA
 * d'Afrique centrale), dont `Intl` restitue justement le symbole « FCFA » en français. Sans ce
 * mappage, `Intl.NumberFormat({ currency: 'FCFA' })` lèverait un `RangeError`.
 */
const ISO_PAR_DEVISE: Record<Devise, string> = { FCFA: 'XAF', EUR: 'EUR', USD: 'USD', CAD: 'CAD' }

let deviseCourante: Devise = 'FCFA'

/** Applique la devise de l'organisation courante à tout le formatage des montants (§5). */
export function appliquerDevise(devise: Devise): void {
  deviseCourante = devise
}

/** Locale courante (`fr`/`en`) dérivée de la langue d'interface (i18next). */
function locale(): string {
  return i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'fr'
}

/**
 * `Intl.NumberFormat` du formatage monétaire — SOURCE UNIQUE des options (locale, devise ISO, sans
 * décimales). Partagé par `formatMontant` (chaîne : exports, PDF, toasts) ET le composant écran
 * `<Montant>` (via `formatToParts`). Les deux ne doivent JAMAIS diverger : d'où ce point unique.
 */
export function formatteurMontant(): Intl.NumberFormat {
  return new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency: ISO_PAR_DEVISE[deviseCourante] ?? 'XAF',
    maximumFractionDigits: 0,
  })
}

/**
 * Montant entier formaté dans la langue courante ET la devise de l'organisation. Sans décimales :
 * les montants sont stockés en entiers dans l'unité principale, on n'invente pas de centimes.
 * Ex. FR/FCFA → « 30 000 FCFA », FR/EUR → « 30 000 € », EN/USD → « $30,000 ».
 */
export function formatMontant(montant: number): string {
  return formatteurMontant().format(montant)
}

/** Nombre entier groupé selon la langue courante, ex. `1234` → « 1 234 » (fr) / « 1,234 » (en). */
export function formatNombre(n: number): string {
  return new Intl.NumberFormat(locale()).format(n)
}

/**
 * Pourcentage locale-aware. `valeur` est déjà un pourcentage (ex. `50` = 50 %), donc on divise
 * par 100 pour le style `percent` d'`Intl` (qui multiplie par 100) : FR → « 50 % », EN → « 50% ».
 */
export function formatPourcent(valeur: number): string {
  return new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: 2 }).format(
    valeur / 100,
  )
}
