import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formate une date ISO en français (jj mois aaaa). Repli sur `—` si absente/invalide. */
export function formatDateFR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
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
