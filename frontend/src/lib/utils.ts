import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import i18n from "@/lib/i18n"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Locale courante (`fr`/`en`) dérivée de la langue d'interface (i18next), pour les dates (F6). */
function locale(): string {
  return i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'fr'
}

/** Format « jj mois aaaa » par défaut, réutilisé par les nombreux appels sans options. */
const DATE_LONGUE: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' }

/**
 * Formate une date ISO selon la LANGUE de l'utilisateur (§4/F6), plus « fr-FR » en dur.
 * Repli sur `—` si absente/invalide. `options` permet des formats courts/numériques ponctuels.
 */
export function formatDate(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions = DATE_LONGUE,
): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale(), options)
}

/** Formate une date+heure ISO selon la langue courante (medium/short). Repli sur `—`. */
export function formatDateHeure(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Délai d'entrée décalé pour une liste (guideline §7 `stagger-sequence` : 30–50ms/item).
 * À combiner avec la classe `nk-reveal`. Plafonné pour éviter d'attendre sur les longues listes.
 */
export function staggerDelay(index: number, step = 0.04, cap = 12): { animationDelay: string } {
  return { animationDelay: `${Math.min(index, cap) * step}s` }
}

/**
 * Normalise un texte pour une recherche insensible à la CASSE et aux ACCENTS : minusculisation +
 * décomposition Unicode (NFD) puis suppression des diacritiques combinants. Ex. « Étienne » et
 * « ETIENNE » et « etienne » deviennent tous « etienne ». À utiliser des DEUX côtés (requête et
 * valeur comparée) pour que « e » retrouve « é ».
 */
export function normaliserTexte(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Num\u00e9ro au format attendu par `wa.me` : chiffres INTERNATIONAUX sans `+`. Miroir l\u00e9ger de la
 * normalisation E.164 du back (d\u00e9faut Cameroun `237`) : retire `+`/espaces/tirets, g\u00e8re un
 * pr\u00e9fixe `00`, pr\u00e9fixe `237` pour un num\u00e9ro local (8\u20139 chiffres). Renvoie `''` si rien
 * d'exploitable \u2192 `wa.me` s'ouvre alors sans destinataire (l'utilisateur choisit le contact).
 */
export function telephoneWaMe(brut: string | null | undefined): string {
  if (!brut) return ''
  let d = brut.replace(/\D/g, '') // chiffres uniquement (retire +, espaces, tirets\u2026)
  d = d.replace(/^00/, '') // pr\u00e9fixe international 00 \u2192 rien
  if (d.startsWith('237')) return d // d\u00e9j\u00e0 international (Cameroun)
  d = d.replace(/^0+/, '') // 0 initial local \u00e9ventuel
  if (d.length >= 8 && d.length <= 9) return `237${d}` // local Cameroun \u2192 international
  return d // autre indicatif pr\u00e9sum\u00e9 d\u00e9j\u00e0 international, ou vide
}

/**
 * Après un échec de validation (§8 `focus-management`) : place le focus sur le premier
 * contrôle en erreur d'un formulaire pour que l'utilisateur atterrisse là où corriger.
 * Les champs Field portent `aria-invalid="true"` quand ils ont une erreur — on cible ça.
 * À appeler dans un requestAnimationFrame pour laisser le re-render poser l'attribut.
 */
export function focusPremierChampInvalide(form: HTMLElement | null): void {
  const cible = form?.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (cible) {
    // Field pose `aria-invalid` sur son ENFANT DIRECT : quand c'est un conteneur (wrapper
    // d'icône, PasswordInput…), on descend vers le contrôle réel — un div n'est pas focusable.
    const controle = cible.matches('input, select, textarea')
      ? cible
      : (cible.querySelector<HTMLElement>('input, select, textarea') ?? cible)
    controle.focus()
    cible.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
}

/**
 * L'utilisateur a-t-il demandé une réduction des animations ? (§1 accessibilité)
 * À interroger avant toute animation d'entrée pilotée en JS (jauges, barres §10)
 * pour livrer directement l'état final au lieu d'animer.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}
