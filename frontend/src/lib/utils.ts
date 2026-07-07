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
 * Après un échec de validation (§8 `focus-management`) : place le focus sur le premier
 * contrôle en erreur d'un formulaire pour que l'utilisateur atterrisse là où corriger.
 * Les champs Field portent `aria-invalid="true"` quand ils ont une erreur — on cible ça.
 * À appeler dans un requestAnimationFrame pour laisser le re-render poser l'attribut.
 */
export function focusPremierChampInvalide(form: HTMLElement | null): void {
  const cible = form?.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (cible) {
    cible.focus()
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
